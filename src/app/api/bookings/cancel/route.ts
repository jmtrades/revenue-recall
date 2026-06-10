import { resolveProvider } from "@/lib/crm/registry";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getOrgSettings } from "@/lib/org";
import { getBooking, cancelBooking } from "@/lib/meetings/store";
import { verifyBookingManageToken } from "@/lib/meetings/manage";
import { hostedBookingUrl } from "@/lib/meetings/token";
import { ownerEmailsForOrg } from "@/lib/billing/lifecycle";
import { sendEmail } from "@/lib/comms";
import { prospectStrings, fill, type ProspectStrings } from "@/lib/i18n/prospect";
import { localeFor } from "@/lib/languages";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Self-serve booking cancellation, linked from the confirmation email. GET shows
 * a localized confirm page (so an email client's link prefetch can't cancel a
 * real meeting); POST performs the cancel. Authed by an HMAC over org+booking —
 * a prospect manages only their own meeting, no account needed. Cancelling frees
 * the slot automatically (busyIntervals counts only confirmed bookings).
 */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(dir: "ltr" | "rtl", title: string, inner: string, status: number): Response {
  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0e14;color:#e7eaf0;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:30rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}p{color:#8a93a6;line-height:1.5;margin:.25rem 0}
button,a.btn{display:inline-block;margin-top:1rem;border:0;border-radius:.6rem;padding:.7rem 1.4rem;font-size:.95rem;font-weight:600;cursor:pointer;text-decoration:none}
.danger{background:#e5484d;color:#fff}.brand{background:#3b82f6;color:#fff}</style></head>
<body><div class="card">${inner}</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function whenLabel(iso: string, tz: string, lang?: string): string {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { timeZone: tz || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

function gonePage(s: ProspectStrings, org: string): Response {
  const rebook = hostedBookingUrl(org);
  const cta = rebook ? `<a class="btn brand" href="${esc(rebook)}">${esc(s.cancelRebook)}</a>` : "";
  return shell(s.dir, s.cancelGoneTitle, `<h1>${esc(s.cancelGoneTitle)}</h1><p>${esc(s.cancelGoneBody)}</p>${cta}`, 404);
}

export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "bookingcancel"), 60, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const url = new URL(req.url);
  const org = url.searchParams.get("org") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t");
  if (!verifyBookingManageToken(org, id, token)) {
    const s = prospectStrings();
    return shell(s.dir, s.bookingUnavailableTitle, `<h1>${esc(s.bookingUnavailableTitle)}</h1><p>${esc(s.bookingUnavailableBody)}</p>`, 401);
  }

  const data = await runWithOrg(org, async () => {
    const [booking, settings] = await Promise.all([getBooking(id), getOrgSettings().catch(() => null)]);
    return { booking, brand: settings?.name || "us", lang: settings?.language };
  }).catch(() => ({ booking: null, brand: "us", lang: undefined as string | undefined }));

  const s = prospectStrings(data.lang);
  if (!data.booking || data.booking.status !== "confirmed") return gonePage(s, org);

  const detail = `${fill(s.bookedWith, { meeting: data.booking.meetingName, brand: data.brand })} — ${whenLabel(data.booking.startsAt, data.booking.timezone, data.lang)}`;
  const form = `<form method="POST" action="/api/bookings/cancel">
<input type="hidden" name="org" value="${esc(org)}"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="t" value="${esc(token!)}">
<button class="danger" type="submit">${esc(s.cancelButton)}</button></form>`;
  return shell(s.dir, s.cancelHeading, `<h1>${esc(s.cancelHeading)}</h1><p>${esc(detail)}</p>${form}`, 200);
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "bookingcancel"), 60, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const formData = await req.formData().catch(() => null);
  const org = String(formData?.get("org") ?? "");
  const id = String(formData?.get("id") ?? "");
  const token = formData ? String(formData.get("t") ?? "") : "";
  if (!verifyBookingManageToken(org, id, token)) {
    const s = prospectStrings();
    return shell(s.dir, s.bookingUnavailableTitle, `<h1>${esc(s.bookingUnavailableTitle)}</h1><p>${esc(s.bookingUnavailableBody)}</p>`, 401);
  }

  const result = await runWithOrg(org, async () => {
    const settings = await getOrgSettings().catch(() => null);
    const booking = await cancelBooking(id);
    if (booking && booking.status === "confirmed") {
      // Was confirmed → now cancelled: log it and tell the owner. Best-effort.
      await resolveProvider()
        .then((p) => (booking.dealId || booking.contactId ? p.logActivity({ contactId: booking.contactId ?? undefined, opportunityId: booking.dealId ?? undefined, kind: "note", summary: `Meeting cancelled by ${booking.inviteeName} (was ${booking.meetingName}).`, direction: "inbound", occurredAt: new Date().toISOString() }) : null))
        .catch(() => undefined);
      const owners = await ownerEmailsForOrg(org).catch(() => []);
      for (const addr of owners) {
        await sendEmail(addr, `Booking cancelled: ${booking.meetingName} with ${booking.inviteeName}`, `${booking.inviteeName} cancelled their ${booking.meetingName}. The slot is free again.`, { internal: true }).catch(() => null);
      }
    }
    return { booking, brand: settings?.name || "us", lang: settings?.language };
  }).catch(() => ({ booking: null, brand: "us", lang: undefined as string | undefined }));

  const s = prospectStrings(result.lang);
  if (!result.booking) return gonePage(s, org);

  const rebook = hostedBookingUrl(org);
  const cta = rebook ? `<a class="btn brand" href="${esc(rebook)}">${esc(s.cancelRebook)}</a>` : "";
  return shell(s.dir, s.cancelledTitle, `<h1>${esc(s.cancelledTitle)}</h1><p>${esc(s.cancelledBody)}</p>${cta}`, 200);
}
