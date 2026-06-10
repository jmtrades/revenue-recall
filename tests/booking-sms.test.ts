import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Availability, DayWindow, Booking } from "@/lib/meetings/types";

/**
 * SMS booking notifications: a transactional confirmation on booking and an SMS
 * reminder, both gated on the invitee giving a phone AND SMS being live, sent in
 * the org's selling language from the org's caller-ID.
 */
const allDay: DayWindow[] = [{ start: "00:00", end: "23:30" }];
const open247: Availability = {
  timezone: "UTC",
  weekly: { 0: allDay, 1: allDay, 2: allDay, 3: allDay, 4: allDay, 5: allDay, 6: allDay },
  slotMinutes: 30,
  minNoticeMinutes: 0,
  horizonDays: 14,
};

const h = vi.hoisted(() => ({
  smsLive: true,
  sms: [] as Array<{ to: string; body: string; from?: string }>,
  due: [] as Booking[],
}));

vi.mock("@/lib/meetings/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/meetings/store")>()),
  getAvailability: vi.fn(async () => open247),
  getMeetingTypeBySlug: vi.fn(async () => null),
  busyIntervals: vi.fn(async () => []),
  insertBooking: vi.fn(async (row: Record<string, unknown>) => ({ id: "bk_1", status: "confirmed", createdAt: "", ...row })),
  bookingsNeedingReminder: vi.fn(async () => h.due),
  markReminderSent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/org", async (orig) => ({
  ...(await orig<typeof import("@/lib/org")>()),
  getOrgSettings: vi.fn(async () => ({ name: "Acme", language: "es", currency: "USD", callerId: "+15551230000" })),
}));
vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  channelStatus: vi.fn(() => ({ email: { provider: "log", live: false }, sms: { provider: "log", live: h.smsLive }, voice: { provider: "log", live: false } })),
  sendEmail: vi.fn(async () => ({ id: "e", status: "logged", provider: "log" })),
  sendSms: vi.fn(async (to: string, body: string, opts: { from?: string } = {}) => {
    h.sms.push({ to, body, from: opts.from });
    return { id: "s", status: "sent", provider: "test" };
  }),
}));
vi.mock("@/lib/billing/lifecycle", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/lifecycle")>()),
  ownerEmailsForOrg: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase/active-org", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/active-org")>()),
  resolveActiveOrgId: vi.fn(async () => "org_1"),
}));
vi.mock("@/lib/webhooks-out", async (orig) => ({
  ...(await orig<typeof import("@/lib/webhooks-out")>()),
  emitWebhook: vi.fn(async () => undefined),
}));

import { bookMeeting } from "@/lib/meetings/book";
import { runBookingReminders } from "@/lib/meetings/reminders";

function futureStart(days = 3): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}
function booking(p: Partial<Booking> = {}): Booking {
  return { id: "bk_1", meetingTypeId: null, meetingName: "Intro call", durationMinutes: 30, contactId: "c1", dealId: "d1", inviteeName: "Pat", inviteePhone: "+15557654321", startsAt: "2026-07-01T15:00:00.000Z", endsAt: "2026-07-01T15:30:00.000Z", timezone: "UTC", status: "confirmed", createdAt: "", ...p };
}

beforeEach(() => {
  h.smsLive = true;
  h.sms = [];
  h.due = [];
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

describe("SMS on booking", () => {
  it("texts a Spanish confirmation from the org caller-ID when a phone is given", async () => {
    await bookMeeting({ startIso: futureStart(), name: "Pat", phone: "+15557654321" });
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0].to).toBe("+15557654321");
    expect(h.sms[0].from).toBe("+15551230000");
    expect(h.sms[0].body).toContain("confirmada"); // Spanish smsConfirm
  });

  it("sends no SMS when SMS isn't live", async () => {
    h.smsLive = false;
    await bookMeeting({ startIso: futureStart(), name: "Pat", phone: "+15557654321" });
    expect(h.sms).toHaveLength(0);
  });

  it("sends no SMS when no phone was given", async () => {
    await bookMeeting({ startIso: futureStart(), name: "Pat", email: "pat@x.com" });
    expect(h.sms).toHaveLength(0);
  });
});

describe("SMS on reminder", () => {
  it("texts a Spanish reminder for an upcoming booking with a phone", async () => {
    h.due = [booking()];
    const res = await runBookingReminders(new Date("2026-06-30T15:00:00.000Z"));
    expect(res.sent).toBe(1);
    expect(h.sms.some((m) => m.to === "+15557654321" && /Recordatorio/.test(m.body))).toBe(true);
  });

  it("skips SMS when SMS isn't live", async () => {
    h.smsLive = false;
    h.due = [booking()];
    await runBookingReminders(new Date("2026-06-30T15:00:00.000Z"));
    expect(h.sms).toHaveLength(0);
  });
});
