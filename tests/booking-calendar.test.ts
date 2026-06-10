import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Booking } from "@/lib/meetings/types";

/**
 * Booked meetings reach the rep's radar: the in-app calendar (getCalendar),
 * the subscribable ICS feed (DTEND span), and the per-booking "Add to
 * calendar" download.
 */
const h = vi.hoisted(() => ({
  bookings: [] as Booking[],
  booking: null as Booking | null,
}));

vi.mock("@/lib/meetings/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/meetings/store")>()),
  listBookings: vi.fn(async () => h.bookings),
  getBooking: vi.fn(async () => h.booking),
}));

import { getCalendar } from "@/lib/queries";
import { toIcs } from "@/lib/calendar-feed";
import { bookingIcsToken, verifyBookingIcsToken, bookingIcsUrl } from "@/lib/meetings/ics";
import { GET as icsGet } from "@/app/api/bookings/ics/route";
import { _resetRateLimit } from "@/lib/ratelimit";

function booking(p: Partial<Booking> = {}): Booking {
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  return {
    id: "bk_1",
    meetingTypeId: null,
    meetingName: "Intro call",
    durationMinutes: 30,
    contactId: "c1",
    dealId: "d1",
    inviteeName: "Pat Buyer",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
    timezone: "UTC",
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...p,
  };
}

beforeEach(() => {
  h.bookings = [];
  h.booking = null;
  _resetRateLimit();
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

describe("getCalendar includes booked meetings", () => {
  it("renders a booking as a 'meeting' event with start, end, and the deal link", async () => {
    h.bookings = [booking()];
    const { events } = await getCalendar();
    const m = events.find((e) => e.type === "meeting");
    expect(m).toBeTruthy();
    expect(m!.title).toBe("Meeting · Intro call — Pat Buyer");
    expect(m!.end).toBe(h.bookings[0].endsAt);
    expect(m!.dealId).toBe("d1");
  });

  it("has no meeting events when there are no bookings", async () => {
    const { events } = await getCalendar();
    expect(events.some((e) => e.type === "meeting")).toBe(false);
  });
});

describe("toIcs duration", () => {
  it("emits DTEND when an event has an end, and omits it otherwise", () => {
    const withEnd = toIcs([{ date: "2026-07-01T15:00:00.000Z", end: "2026-07-01T15:30:00.000Z", title: "Demo" }]);
    expect(withEnd).toContain("DTSTART:20260701T150000Z");
    expect(withEnd).toContain("DTEND:20260701T153000Z");
    const without = toIcs([{ date: "2026-07-01T15:00:00.000Z", title: "Follow up" }]);
    expect(without).not.toContain("DTEND");
  });
});

describe("booking ics token + endpoint", () => {
  it("signs per org+booking and rejects tampering / cross-booking reuse", () => {
    const t = bookingIcsToken("org_1", "bk_1");
    expect(t).toBeTruthy();
    expect(verifyBookingIcsToken("org_1", "bk_1", t)).toBe(true);
    expect(verifyBookingIcsToken("org_1", "bk_2", t)).toBe(false);
    expect(verifyBookingIcsToken("org_2", "bk_1", t)).toBe(false);
    expect(verifyBookingIcsToken("org_1", "bk_1", null)).toBe(false);
  });

  it("builds the download URL only with a public base + secret", () => {
    expect(bookingIcsUrl("org_1", "bk_1")).toContain("https://app.example.com/api/bookings/ics?org=org_1&id=bk_1&t=");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(bookingIcsUrl("org_1", "bk_1")).toBeNull();
  });

  it("serves a single VEVENT with DTSTART/DTEND for a valid link", async () => {
    h.booking = booking();
    const t = bookingIcsToken("org_1", "bk_1");
    const res = await icsGet(new Request(`http://x/api/bookings/ics?org=org_1&id=bk_1&t=${t}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("DTEND:");
    expect(body).toContain("Intro call");
  });

  it("rejects a bad signature (401) and a cancelled/missing booking (404)", async () => {
    expect((await icsGet(new Request("http://x/api/bookings/ics?org=org_1&id=bk_1&t=bad"))).status).toBe(401);
    h.booking = booking({ status: "cancelled" });
    const t = bookingIcsToken("org_1", "bk_1");
    expect((await icsGet(new Request(`http://x/api/bookings/ics?org=org_1&id=bk_1&t=${t}`))).status).toBe(404);
    h.booking = null;
    expect((await icsGet(new Request(`http://x/api/bookings/ics?org=org_1&id=bk_1&t=${t}`))).status).toBe(404);
  });
});
