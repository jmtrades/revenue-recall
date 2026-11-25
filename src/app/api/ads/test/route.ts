import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { adsConfig } from "@/lib/ads/forward";
import { ADS_EVENTS } from "@/lib/ads/store";
import { trackAds } from "@/lib/ads/track";

export const dynamic = "force-dynamic";

/** Fire each funnel event once. Meta receives them only when META_TEST_EVENT_CODE is set. */
export const POST = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const cfg = adsConfig();
  const results = [];
  for (const name of ADS_EVENTS) {
    const result = await trackAds({
      name,
      eventId: `test_${name}_${Date.now()}`,
      test: true,
      consent: true,
      email: "ads-test@example.com",
      personName: "Test Lead",
      value: name === "Purchase" ? 1 : undefined,
      currency: "USD",
      attribution: { first: null, last: { source: "test", medium: "test", campaign: "test-mode", content: name, term: "", fbclid: "", gclid: "", ttclid: "", referrer: "", landing: "/", at: new Date().toISOString() } },
    });
    results.push({ name, eventId: result.eventId, forwarded: result.forwarded });
  }
  return NextResponse.json({
    ok: true,
    testEventCode: Boolean(cfg.metaTestCode),
    metaConfigured: Boolean(cfg.metaPixelId && cfg.metaToken),
    ga4Configured: Boolean(cfg.ga4Id && cfg.ga4Secret),
    results,
  });
});
