import { verifyBookingIcsToken } from "@/lib/meetings/ics";
import { getBooking } from "@/lib/meetings/store";
import { getOrgSettings } from "@/lib/org";
import { runWithOrg } from "@/lib/supabase/org-context";
import { toIcs } from "@/lib/calendar-feed";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * "Add to calendar" download for ONE booking — linked from the confirmation
 * email, so any calendar app (Google/Apple/Outlook) can import the meeting.
 * Public but self-authed by an HMAC over the org+booking pair; reveals exactly
 * one event and nothing else.
 */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "bookingics"), 60, 60_000).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t");
  if (!verifyBookingIcsToken(orgId, id, token)) {
    return new Response("Invalid or expired link", { status: 401 });
  }

  const data = await runWithOrg(orgId, async () => {
    const [booking, settings] = await Promise.all([getBooking(id), getOrgSettings().catch(() => null)]);
    return { booking, brand: settings?.name || "Revenue Recall" };
  }).catch(() => ({ booking: null, brand: "Revenue Recall" }));

  if (!data.booking || data.booking.status !== "confirmed") {
    return new Response("Booking not found", { status: 404 });
  }

  const ics = toIcs([
    {
      date: data.booking.startsAt,
      end: data.booking.endsAt,
      title: `${data.booking.meetingName} — ${data.brand}`,
      dealId: data.booking.dealId ?? undefined,
    },
  ]);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meeting.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
