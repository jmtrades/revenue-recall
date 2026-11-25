import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-compare";
import { parseScheduleWebhook } from "@/lib/ads/forward";
import { trackAds } from "@/lib/ads/track";

export const dynamic = "force-dynamic";

/**
 * Calendly (invitee.created) and Cal.com (BOOKING_CREATED).
 * Set ADS_WEBHOOK_TOKEN and pass it as ?token= to reject anyone else.
 * With no token configured the payload shape is still required.
 */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "ads-schedule"), 60, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const expected = (process.env.ADS_WEBHOOK_TOKEN ?? "").trim();
  if (expected) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!provided || !safeEqual(provided, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const booking = parseScheduleWebhook(body);
  if (!booking) return NextResponse.json({ ok: true, ignored: "not_a_booking" });
  const result = await trackAds({
    name: "Schedule",
    eventId: `schedule_${(booking.email || booking.start || "guest").slice(0, 40)}_${(booking.start || "").slice(0, 20)}`,
    email: booking.email,
    phone: booking.phone,
    personName: booking.name,
    consent: true,
  });
  return NextResponse.json(result);
});
