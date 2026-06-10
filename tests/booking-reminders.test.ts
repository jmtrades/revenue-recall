import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Booking } from "@/lib/meetings/types";

/**
 * runBookingReminders: emails each upcoming invitee once, in the org's selling
 * language, marking the booking reminded BEFORE sending (so a crash can't
 * double-remind). The store scan + sendEmail are mocked.
 */
const h = vi.hoisted(() => ({
  due: [] as Booking[],
  marked: [] as string[],
  emails: [] as Array<{ to: string; subject: string; body: string }>,
  scanArgs: null as { now: string; within: string } | null,
}));

vi.mock("@/lib/meetings/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/meetings/store")>()),
  bookingsNeedingReminder: vi.fn(async (now: string, within: string) => {
    h.scanArgs = { now, within };
    return h.due;
  }),
  markReminderSent: vi.fn(async (id: string) => {
    h.marked.push(id);
  }),
}));
vi.mock("@/lib/org", async (orig) => ({
  ...(await orig<typeof import("@/lib/org")>()),
  getOrgSettings: vi.fn(async () => ({ name: "Acme Realty", language: "es" })),
}));
vi.mock("@/lib/supabase/active-org", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/active-org")>()),
  resolveActiveOrgId: vi.fn(async () => "org_1"),
}));
vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  sendEmail: vi.fn(async (to: string, subject: string, body: string) => {
    h.emails.push({ to, subject, body });
    return { id: "e", status: "logged", provider: "log" };
  }),
}));

import { runBookingReminders } from "@/lib/meetings/reminders";

function booking(p: Partial<Booking> = {}): Booking {
  return {
    id: "bk_1",
    meetingTypeId: null,
    meetingName: "Intro call",
    durationMinutes: 30,
    contactId: "c1",
    dealId: "d1",
    inviteeName: "Pat Buyer",
    inviteeEmail: "pat@x.com",
    startsAt: "2026-07-01T15:00:00.000Z",
    endsAt: "2026-07-01T15:30:00.000Z",
    timezone: "UTC",
    status: "confirmed",
    createdAt: "",
    ...p,
  };
}

beforeEach(() => {
  h.due = [];
  h.marked = [];
  h.emails = [];
  h.scanArgs = null;
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
  delete process.env.BOOKING_REMINDER_HOURS;
});

describe("runBookingReminders", () => {
  it("scans the default 24h window from now", async () => {
    const now = new Date("2026-06-30T12:00:00.000Z");
    await runBookingReminders(now);
    expect(h.scanArgs!.now).toBe("2026-06-30T12:00:00.000Z");
    expect(h.scanArgs!.within).toBe("2026-07-01T12:00:00.000Z"); // +24h
  });

  it("honors BOOKING_REMINDER_HOURS", async () => {
    process.env.BOOKING_REMINDER_HOURS = "2";
    await runBookingReminders(new Date("2026-06-30T12:00:00.000Z"));
    expect(h.scanArgs!.within).toBe("2026-06-30T14:00:00.000Z"); // +2h
  });

  it("emails each invitee in the org's language and marks every booking reminded", async () => {
    h.due = [booking(), booking({ id: "bk_2", inviteeName: "Sam", inviteeEmail: "sam@x.com" })];
    const res = await runBookingReminders(new Date("2026-06-30T15:00:00.000Z"));
    expect(res.sent).toBe(2);
    expect(h.marked.sort()).toEqual(["bk_1", "bk_2"]);
    const first = h.emails.find((e) => e.to === "pat@x.com")!;
    expect(first.subject).toMatch(/^Recordatorio:/); // Spanish reminder subject
    expect(first.body).toContain("Hola Pat Buyer:");
    expect(first.body).toContain("¿Necesitas cancelar o reprogramar? https://app.example.com/api/bookings/cancel?"); // cancel link
  });

  it("marks a booking reminded even when it has no email (won't loop it)", async () => {
    h.due = [booking({ inviteeEmail: undefined })];
    const res = await runBookingReminders();
    expect(res.sent).toBe(0);
    expect(h.marked).toEqual(["bk_1"]);
    expect(h.emails).toHaveLength(0);
  });

  it("no-ops cleanly when nothing is due", async () => {
    const res = await runBookingReminders();
    expect(res).toEqual({ sent: 0 });
    expect(h.emails).toHaveLength(0);
  });
});
