import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { captureLead } from "@/lib/leads-capture";
import { trackAds } from "@/lib/ads/track";
import { resolveAttribution } from "@/lib/ads/touch";
import { fireSpeedToLead } from "@/lib/agent/speed-to-lead";
import { webinarLeak } from "@/lib/webinar/leak";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public calculator capture. Creates the lead and fires Lead. Nothing is dialed. */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "webinar-leak"), 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Wait a moment." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Missing form." }, { status: 400 });
  if (String(body.website ?? "").trim()) return NextResponse.json({ ok: true });
  if (body.consent !== true && body.consent !== "yes") {
    return NextResponse.json({ error: "Consent is required before we can contact you." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().slice(0, 254);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  if (!name || !EMAIL_RE.test(email) || phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Name, a valid email, and a phone number are required." }, { status: 400 });
  }
  const leak = webinarLeak({
    registrants: Number(body.registrants),
    showRate: Number(body.showRate),
    offerPrice: Number(body.offerPrice),
    closeRate: Number(body.closeRate),
  });
  const attr = resolveAttribution(body.attribution, req.headers.get("cookie"));
  const result = await captureLead({
    name,
    email,
    phone,
    source: "Webinar leak calculator",
    notes: leak ? `Estimated monthly leak $${Math.round(leak.leaked)} from ${body.registrants} registrants.` : undefined,
    value: leak ? Math.round(leak.leaked) : undefined,
  });
  await fireSpeedToLead(result.contactId).catch(() => undefined);
  const tracked = await trackAds({
    name: "Lead",
    attribution: attr,
    email,
    phone,
    personName: name,
    consent: true,
    page: "/webinar-leak",
  }).catch(() => null);
  return NextResponse.json({ ok: true, contactId: result.contactId, eventId: tracked?.eventId, leaked: leak?.leaked ?? null });
});
