import { afterEach, describe, expect, it } from "vitest";
import { parseSpendCsv } from "@/lib/ads/csv";
import { sendGa4, sendMeta, parseScheduleWebhook } from "@/lib/ads/forward";
import { hashEmail, hashPhone, sha256 } from "@/lib/ads/hash";
import { buildTrackedUrl } from "@/lib/ads/naming";
import { isEuUkTimezone } from "@/lib/ads/region";
import { adsReport } from "@/lib/ads/rollup";
import { __resetAdsForTests, listAds, putSpend } from "@/lib/ads/store";
import { trackAds } from "@/lib/ads/track";
import { attributionFromCookie, isCampaignTouch, touchFromParams } from "@/lib/ads/touch";

afterEach(() => {
  __resetAdsForTests();
  delete process.env.META_PIXEL_ID;
  delete process.env.META_CAPI_TOKEN;
  delete process.env.META_TEST_EVENT_CODE;
  delete process.env.GA4_ID;
  delete process.env.GA4_API_SECRET;
});

const touch = touchFromParams({
  params: new URLSearchParams("utm_source=meta&utm_medium=paid_social&utm_campaign=webinar-coaches-202611&utm_content=hook-a&fbclid=abc"),
  referrer: "https://facebook.com",
  landing: "/",
  at: "2026-11-25T00:00:00.000Z",
});

describe("ad click capture", () => {
  it("keeps first touch and replaces last touch only for a campaign visit", () => {
    expect(touch.source).toBe("meta");
    expect(touch.fbclid).toBe("abc");
    expect(isCampaignTouch(touch)).toBe(true);
    const direct = touchFromParams({ params: new URLSearchParams(), referrer: "", landing: "/pricing", at: "2026-11-25T00:00:00.000Z" });
    expect(direct.source).toBe("direct");
    expect(isCampaignTouch(direct)).toBe(false);
    const header = `rr_attr_first=${encodeURIComponent(JSON.stringify(touch))}`;
    expect(attributionFromCookie(header).first?.campaign).toBe("webinar-coaches-202611");
  });

  it("builds a tracked url from the naming convention", () => {
    const url = new URL(buildTrackedUrl({ origin: "https://revenue-recall-relaunch.onrender.com", path: "/", source: "youtube", medium: "video", campaign: "webinar-coaches-202611", content: "hook-a" }));
    expect(url.searchParams.get("utm_source")).toBe("youtube");
    expect(url.searchParams.get("utm_content")).toBe("hook-a");
    expect(url.searchParams.get("utm_term")).toBeNull();
  });

  it("shows the cookie banner time zones for the UK and not for the US", () => {
    expect(isEuUkTimezone("Europe/London")).toBe(true);
    expect(isEuUkTimezone("Europe/Berlin")).toBe(true);
    expect(isEuUkTimezone("America/Los_Angeles")).toBe(false);
  });
});

describe("ad conversions", () => {
  it("hashes email and phone the way Meta requires", () => {
    expect(hashEmail("  Test@Example.com ")).toBe(sha256("test@example.com"));
    expect(hashPhone("+1 (650) 288-5280")).toBe(sha256("16502885280"));
    expect(hashEmail("not-an-email")).toBeUndefined();
  });

  it("records each funnel event once and skips the networks when keys are unset", async () => {
    for (const name of ["PageView", "ViewContent", "Lead", "Contact", "Schedule", "Purchase"] as const) {
      const result = await trackAds({
        name,
        eventId: `evt_${name}`,
        consent: true,
        email: "buyer@example.com",
        value: name === "Purchase" ? 49 : undefined,
        currency: "USD",
        attribution: { first: touch, last: touch },
      });
      expect(result.duplicate).toBe(false);
      expect(result.forwarded).toEqual({ meta: "skipped", ga4: "skipped" });
      const again = await trackAds({ name, eventId: `evt_${name}`, consent: true });
      expect(again.duplicate).toBe(true);
    }
    const report = adsReport(listAds().events, [], null, null);
    expect(report.totals.leads).toBe(1);
    expect(report.totals.bookings).toBe(1);
    expect(report.totals.sales).toBe(1);
    expect(report.totals.revenue).toBe(49);
    expect(report.byCampaign[0]?.key).toBe("webinar-coaches-202611");
  });

  it("calculates CPL, cost per booked call, CAC, and ROAS from entered spend", () => {
    putSpend({ id: "s1", date: "2026-11-25", source: "meta", campaign: "webinar-coaches-202611", amount: 100, currency: "USD" });
    const events = [
      { id: "l", name: "Lead" as const, at: "2026-11-25T01:00:00.000Z", source: "meta", medium: "paid_social", campaign: "webinar-coaches-202611", content: "hook-a", term: "", landing: "/" },
      { id: "b", name: "Schedule" as const, at: "2026-11-25T02:00:00.000Z", source: "meta", medium: "paid_social", campaign: "webinar-coaches-202611", content: "hook-a", term: "", landing: "/" },
      { id: "p", name: "Purchase" as const, at: "2026-11-25T03:00:00.000Z", source: "meta", medium: "paid_social", campaign: "webinar-coaches-202611", content: "hook-a", term: "", landing: "/", value: 200, currency: "USD" },
    ];
    const report = adsReport(events, listAds().spend, "2026-11-01", "2026-11-30");
    expect(report.totals.cpl).toBe(100);
    expect(report.totals.costPerBooking).toBe(100);
    expect(report.totals.cac).toBe(100);
    expect(report.totals.roas).toBe(2);
  });

  it("parses a spend CSV and a Calendly or Cal.com booking", () => {
    const csv = parseSpendCsv("date,campaign,spend,source\n2026-11-01,webinar-coaches-202611,42.5,meta\nbad\n");
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0]?.amount).toBe(42.5);
    expect(csv.errors).toHaveLength(1);
    expect(parseScheduleWebhook({ event: "invitee.created", payload: { email: "a@b.co", name: "A" } })?.email).toBe("a@b.co");
    expect(parseScheduleWebhook({ triggerEvent: "BOOKING_CREATED", payload: { attendees: [{ email: "c@d.co" }], startTime: "2026-11-25T15:00:00Z" } })?.email).toBe("c@d.co");
    expect(parseScheduleWebhook({ event: "invitee.canceled" })).toBeNull();
  });

  it("does not call Meta or GA4 without keys", async () => {
    const input = {
      name: "Lead" as const,
      eventId: "x",
      at: "2026-11-25T00:00:00.000Z",
      touch,
    };
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("ok");
    }) as typeof fetch;
    expect(await sendMeta(input, fetchImpl)).toBe("skipped");
    expect(await sendGa4(input, fetchImpl)).toBe("skipped");
    expect(called).toBe(0);
  });
});
