import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { simulateAttribution, simulateChat, simulateMeta, simulatePlatforms, simulateQuietHours } from "@/lib/journeys/simulate";

export const dynamic = "force-dynamic";

/** Dry run of the sales journeys. No calls, texts, emails, or ad writes. */
export const GET = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "journeys"), 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const origin = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const bookingUrl = process.env.BOOKING_URL || (origin ? `${proto}://${origin}/book/local` : "/book/local");
  const [platforms, meta] = await Promise.all([Promise.resolve(simulatePlatforms()), simulateMeta()]);
  return NextResponse.json({
    dryRun: true,
    placedCall: false,
    platforms,
    meta,
    chat: simulateChat(bookingUrl),
    quietHours: simulateQuietHours(),
    attribution: simulateAttribution(),
  });
});
