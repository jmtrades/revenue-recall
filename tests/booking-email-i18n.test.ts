import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Availability, DayWindow } from "@/lib/meetings/types";

/**
 * A Spanish-selling org's prospect gets a SPANISH booking confirmation; the
 * internal owner notice stays English. Same mock surface as booking-create.
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
  emails: [] as Array<{ to: string; subject: string; body: string }>,
}));

vi.mock("@/lib/meetings/store", () => ({
  getAvailability: vi.fn(async () => open247),
  getMeetingTypeBySlug: vi.fn(async () => null), // default type
  busyIntervals: vi.fn(async () => []),
  findConfirmedBookingForSlot: vi.fn(async () => null),
  insertBooking: vi.fn(async (row: Record<string, unknown>) => ({ id: "bk_1", status: "confirmed", createdAt: "", ...row })),
}));

vi.mock("@/lib/org", async (orig) => ({
  ...(await orig<typeof import("@/lib/org")>()),
  getOrgSettings: vi.fn(async () => ({ name: "Acme Realty", language: "es", currency: "USD" })),
}));

vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  sendEmail: vi.fn(async (to: string, subject: string, body: string) => {
    h.emails.push({ to, subject, body });
    return { id: "e", status: "logged", provider: "log" };
  }),
}));

vi.mock("@/lib/billing/lifecycle", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/lifecycle")>()),
  ownerEmailsForOrg: vi.fn(async () => ["owner@acme.com"]),
}));
vi.mock("@/lib/supabase/active-org", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/active-org")>()),
  resolveActiveOrgId: vi.fn(async () => "org_1"),
}));

import { bookMeeting } from "@/lib/meetings/book";

function futureStart(days = 3): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

beforeEach(() => {
  h.emails = [];
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

describe("booking confirmation language", () => {
  it("confirms the invitee in the org's selling language; the owner notice stays English", async () => {
    const invitee = `pat-${Date.now()}@x.com`;
    await bookMeeting({ startIso: futureStart(), name: "Pat", email: invitee });

    const toInvitee = h.emails.find((e) => e.to === invitee);
    expect(toInvitee).toBeTruthy();
    expect(toInvitee!.subject).toMatch(/^Confirmado:/); // Spanish subject
    expect(toInvitee!.body).toContain("Hola Pat:");
    expect(toInvitee!.body).toContain("Cuándo:");
    // Localized "Add to calendar" line with the signed .ics download.
    expect(toInvitee!.body).toContain("Añadir al calendario: https://app.example.com/api/bookings/ics?");
    // Localized "cancel or reschedule" line with the signed cancel link.
    expect(toInvitee!.body).toContain("¿Necesitas cancelar o reprogramar? https://app.example.com/api/bookings/cancel?");

    const toOwner = h.emails.find((e) => e.to === "owner@acme.com");
    expect(toOwner).toBeTruthy();
    expect(toOwner!.subject).toMatch(/^New booking:/); // internal mail stays English
  });
});
