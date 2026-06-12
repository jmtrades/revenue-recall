import { describe, it, expect, beforeEach } from "vitest";
import { calendarFeedToken, verifyCalendarFeedToken, calendarFeedUrl, toIcs } from "@/lib/calendar-feed";
import { GET as feed } from "@/app/api/calendar/feed/route";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("calendar feed token", () => {
  it("verifies its own token and rejects tampering / cross-org reuse", () => {
    const t = calendarFeedToken("org_1");
    expect(t).toBeTruthy();
    expect(verifyCalendarFeedToken("org_1", t)).toBe(true);
    expect(verifyCalendarFeedToken("org_1", t + "x")).toBe(false);
    expect(verifyCalendarFeedToken("org_2", t)).toBe(false); // token is per-org
    expect(verifyCalendarFeedToken("org_1", null)).toBe(false);
    expect(verifyCalendarFeedToken("", t)).toBe(false);
  });

  it("fails closed in production when no secret is configured (no forgeable constant)", () => {
    const prevEnv = process.env.NODE_ENV;
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.INBOUND_TOKEN;
    delete process.env.CRON_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(calendarFeedToken("org_1")).toBeNull();
      expect(verifyCalendarFeedToken("org_1", "anything")).toBe(false);
      expect(calendarFeedUrl("org_1")).toBeNull();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
      process.env.UNSUBSCRIBE_SECRET = "test-secret";
    }
  });

  it("builds an absolute feed URL only when a public base is set", () => {
    expect(calendarFeedUrl("org_1")).toBeNull();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    const url = calendarFeedUrl("org_1");
    expect(url).toContain("https://app.example.com/api/calendar/feed?org=org_1&token=");
  });
});

describe("toIcs", () => {
  it("serializes a valid iCalendar document with CRLF line endings", () => {
    const ics = toIcs([{ date: "2026-07-01T15:00:00.000Z", title: "Target close · Acme", dealId: "d_1" }]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260701T150000Z");
    expect(ics).toContain("SUMMARY:Target close · Acme");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("escapes special characters and skips events with no date", () => {
    const ics = toIcs([
      { date: "", title: "no date" },
      { date: "2026-07-02T00:00:00.000Z", title: "A; B, C\\D" },
    ]);
    expect(ics).not.toContain("no date");
    expect(ics).toContain("SUMMARY:A\\; B\\, C\\\\D");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });
});

describe("calendar feed endpoint", () => {
  it("rejects a missing/invalid token with 401", async () => {
    const res = await feed(new Request("http://x/api/calendar/feed?org=org_1&token=bad"));
    expect(res.status).toBe(401);
  });

  it("returns a valid text/calendar document for a good token", async () => {
    const token = calendarFeedToken("org_1");
    const res = await feed(new Request(`http://x/api/calendar/feed?org=org_1&token=${token}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
  });
});
