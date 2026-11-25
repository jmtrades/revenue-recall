import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { ADS_EVENTS, type AdsEventName } from "@/lib/ads/store";
import { trackAds } from "@/lib/ads/track";
import { asAttribution } from "@/lib/ads/touch";

export const dynamic = "force-dynamic";

/** Browser funnel events. No-ops the ad networks when their keys are unset. */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "ads-collect"), 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body?.name;
  if (typeof name !== "string" || !ADS_EVENTS.includes(name as AdsEventName)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }
  const value = typeof body?.value === "number" ? body.value : undefined;
  const result = await trackAds({
    name: name as AdsEventName,
    eventId: typeof body?.eventId === "string" ? body.eventId.slice(0, 80) : undefined,
    attribution: asAttribution(body?.attribution),
    page: typeof body?.page === "string" ? body.page.slice(0, 300) : undefined,
    email: typeof body?.email === "string" ? body.email.slice(0, 200) : undefined,
    phone: typeof body?.phone === "string" ? body.phone.slice(0, 40) : undefined,
    personName: typeof body?.personName === "string" ? body.personName.slice(0, 120) : undefined,
    value,
    currency: typeof body?.currency === "string" ? body.currency.slice(0, 8) : undefined,
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
    fbp: typeof body?.fbp === "string" ? body.fbp.slice(0, 80) : undefined,
    consent: body?.consent === true,
  });
  return NextResponse.json(result);
});
