import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Availability, BusyInterval, DayWindow, MeetingType } from "@/lib/meetings/types";

/**
 * bookMeeting orchestration. The DB-touching store + outbound side effects are
 * mocked so we can assert the flow in isolation; the contact/deal creation runs
 * against the real in-memory CRM provider (same path the lead form exercises).
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
  availability: null as Availability | null,
  meetingType: null as MeetingType | null,
  busy: [] as BusyInterval[],
  inserted: [] as Array<Record<string, unknown>>,
  emails: [] as Array<{ to: string; subject: string }>,
  webhooks: [] as string[],
  existingBooking: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/meetings/store", () => ({
  getAvailability: vi.fn(async () => h.availability),
  getMeetingTypeBySlug: vi.fn(async () => h.meetingType),
  busyIntervals: vi.fn(async () => h.busy),
  findConfirmedBookingForSlot: vi.fn(async () => h.existingBooking),
  insertBooking: vi.fn(async (row: Record<string, unknown>) => {
    const b = { id: `bk_${h.inserted.length + 1}`, status: "confirmed", createdAt: new Date().toISOString(), ...row };
    h.inserted.push(b);
    return b;
  }),
}));

vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  sendEmail: vi.fn(async (to: string, subject: string) => {
    h.emails.push({ to, subject });
    return { id: "e", status: "logged", provider: "log" };
  }),
}));

vi.mock("@/lib/webhooks-out", async (orig) => ({
  ...(await orig<typeof import("@/lib/webhooks-out")>()),
  emitWebhook: vi.fn(async (event: string) => {
    h.webhooks.push(event);
  }),
}));

import { bookMeeting, BookingError } from "@/lib/meetings/book";
import { getProvider } from "@/lib/crm/registry";

/** A grid-aligned UTC start `days` out, on a clean hour (always within horizon). */
function futureStart(days = 3, minute = 0): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCMinutes(minute, 0, 0);
  return d.toISOString();
}

beforeEach(() => {
  h.availability = open247;
  h.meetingType = { id: "mt_1", name: "Demo", slug: "demo", durationMinutes: 30, locationKind: "video", enabled: true };
  h.busy = [];
  h.inserted = [];
  h.emails = [];
  h.webhooks = [];
  h.existingBooking = null;
});

describe("bookMeeting", () => {
  it("books a valid slot: creates a contact + deal, persists the booking, confirms, and fires the webhook", async () => {
    const email = `book-${Date.now()}@acme.com`;
    const start = futureStart();
    const res = await bookMeeting({ slug: "demo", startIso: start, name: "Pat Buyer", email });

    expect(res.bookingId).toBe("bk_1");
    expect(res.meetingName).toBe("Demo");
    expect(res.startsAt).toBe(start);
    // End is start + the type's duration.
    expect(new Date(res.endsAt).getTime() - new Date(res.startsAt).getTime()).toBe(30 * 60_000);

    // Persisted row snapshots the type + carries the created contact/deal.
    const row = h.inserted[0];
    expect(row.meetingTypeId).toBe("mt_1");
    expect(row.meetingName).toBe("Demo");
    expect(row.durationMinutes).toBe(30);
    expect(typeof row.contactId).toBe("string");
    expect(typeof row.dealId).toBe("string");

    // Confirmation email went to the invitee.
    expect(h.emails.some((e) => e.to === email)).toBe(true);
    // The booking webhook fired.
    expect(h.webhooks).toContain("meeting.booked");

    // The contact really landed in the CRM (same path the lead form uses).
    const contacts = await getProvider().listContacts();
    expect(contacts.some((c) => c.points.some((p) => p.value === email))).toBe(true);
  });

  it("falls back to the default meeting type when no slug is given (zero-config)", async () => {
    const res = await bookMeeting({ startIso: futureStart(4), name: "No Slug", email: `ns-${Date.now()}@acme.com` });
    expect(res.meetingName).toBe("Intro call");
    expect(h.inserted[0].meetingTypeId).toBeNull(); // default type isn't a stored row
  });

  it("rejects a time that isn't on the live availability grid (anti-tamper)", async () => {
    await expect(bookMeeting({ slug: "demo", startIso: futureStart(3, 7), name: "Off Grid", email: "x@y.com" })).rejects.toBeInstanceOf(BookingError);
    expect(h.inserted).toHaveLength(0);
  });

  it("rejects a slot already taken by another booking (anti-double-book)", async () => {
    const start = futureStart(5);
    h.busy = [{ start, end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString() }];
    await expect(bookMeeting({ slug: "demo", startIso: start, name: "Clash", email: "x@y.com" })).rejects.toBeInstanceOf(BookingError);
    expect(h.inserted).toHaveLength(0);
  });

  it("rejects a disabled meeting type", async () => {
    h.meetingType = { id: "mt_2", name: "Closed", slug: "demo", durationMinutes: 30, locationKind: "phone", enabled: false };
    await expect(bookMeeting({ slug: "demo", startIso: futureStart(), name: "Nope", email: "x@y.com" })).rejects.toBeInstanceOf(BookingError);
  });

  it("is idempotent on a double-submit: returns the existing booking, no second insert/email/webhook", async () => {
    // The invitee already has this exact slot booked (double-click / retry).
    h.existingBooking = { id: "bk_existing", status: "confirmed" };
    const res = await bookMeeting({ slug: "demo", startIso: futureStart(6), name: "Dup Buyer", email: `dup-${Date.now()}@acme.com` });
    expect(res.bookingId).toBe("bk_existing"); // the SAME booking, not a new one
    expect(h.inserted).toHaveLength(0); // no duplicate row
    expect(h.emails).toHaveLength(0); // no duplicate confirmation
    expect(h.webhooks).not.toContain("meeting.booked"); // no duplicate booking webhook
    // (captureLead dedupes the contact on the same email in reality, so lead.created
    //  doesn't re-fire either — that's covered by the lead-capture dedup tests.)
  });

  it("requires a name and a contact method", async () => {
    await expect(bookMeeting({ slug: "demo", startIso: futureStart(), name: "" , email: "x@y.com" })).rejects.toBeInstanceOf(BookingError);
    await expect(bookMeeting({ slug: "demo", startIso: futureStart(), name: "No Contact" })).rejects.toBeInstanceOf(BookingError);
    expect(h.inserted).toHaveLength(0);
  });
});
