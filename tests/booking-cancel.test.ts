import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Booking } from "@/lib/meetings/types";

/**
 * Self-serve booking cancellation: the manage token + the confirm-then-cancel
 * route. The store + side effects are mocked; we assert auth, the GET confirm
 * page, the POST cancel, idempotency on an already-cancelled booking, and that
 * the page is localized to the org's selling language.
 */
const h = vi.hoisted(() => ({
  booking: null as Booking | null,
  cancelled: [] as string[],
  ownerEmails: [] as Array<{ to: string; subject: string }>,
}));

vi.mock("@/lib/meetings/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/meetings/store")>()),
  getBooking: vi.fn(async () => h.booking),
  cancelBooking: vi.fn(async (id: string) => {
    h.cancelled.push(id);
    return h.booking; // returns the booking as it was BEFORE cancel
  }),
}));
vi.mock("@/lib/org", async (orig) => ({
  ...(await orig<typeof import("@/lib/org")>()),
  getOrgSettings: vi.fn(async () => ({ name: "Acme Realty", language: "es" })),
}));
vi.mock("@/lib/billing/lifecycle", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/lifecycle")>()),
  ownerEmailsForOrg: vi.fn(async () => ["owner@acme.com"]),
}));
vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  sendEmail: vi.fn(async (to: string, subject: string) => {
    h.ownerEmails.push({ to, subject });
    return { id: "e", status: "logged", provider: "log" };
  }),
}));
vi.mock("@/lib/crm/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/crm/registry")>()),
  resolveProvider: vi.fn(async () => ({ logActivity: vi.fn(async () => ({})) })),
}));

import { GET, POST } from "@/app/api/bookings/cancel/route";
import { bookingManageToken, verifyBookingManageToken, bookingCancelUrl } from "@/lib/meetings/manage";
import { _resetRateLimit } from "@/lib/ratelimit";

function booking(p: Partial<Booking> = {}): Booking {
  return {
    id: "bk_1",
    meetingTypeId: null,
    meetingName: "Intro call",
    durationMinutes: 30,
    contactId: "c1",
    dealId: "d1",
    inviteeName: "Pat Buyer",
    startsAt: "2026-07-01T15:00:00.000Z",
    endsAt: "2026-07-01T15:30:00.000Z",
    timezone: "UTC",
    status: "confirmed",
    createdAt: "",
    ...p,
  };
}

beforeEach(() => {
  h.booking = null;
  h.cancelled = [];
  h.ownerEmails = [];
  _resetRateLimit();
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

describe("booking manage token", () => {
  it("signs per org+booking, rejects tampering / cross-booking / cross-org", () => {
    const t = bookingManageToken("org_1", "bk_1");
    expect(verifyBookingManageToken("org_1", "bk_1", t)).toBe(true);
    expect(verifyBookingManageToken("org_1", "bk_2", t)).toBe(false);
    expect(verifyBookingManageToken("org_2", "bk_1", t)).toBe(false);
    expect(verifyBookingManageToken("org_1", "bk_1", null)).toBe(false);
  });

  it("differs from the .ics token (distinct purpose tag)", async () => {
    const { bookingIcsToken } = await import("@/lib/meetings/ics");
    expect(bookingManageToken("org_1", "bk_1")).not.toBe(bookingIcsToken("org_1", "bk_1"));
  });

  it("builds the cancel URL only with a public base + secret", () => {
    expect(bookingCancelUrl("org_1", "bk_1")).toContain("https://app.example.com/api/bookings/cancel?org=org_1&id=bk_1&t=");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(bookingCancelUrl("org_1", "bk_1")).toBeNull();
  });
});

describe("GET /api/bookings/cancel (confirm page)", () => {
  it("rejects an invalid token with 401", async () => {
    const res = await GET(new Request("http://x/api/bookings/cancel?org=org_1&id=bk_1&t=bad"));
    expect(res.status).toBe(401);
  });

  it("shows a localized confirm page with a POST form for a confirmed booking", async () => {
    h.booking = booking();
    const t = bookingManageToken("org_1", "bk_1");
    const res = await GET(new Request(`http://x/api/bookings/cancel?org=org_1&id=bk_1&t=${t}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("¿Cancelar esta reunión?"); // Spanish heading
    expect(html).toContain("Sí, cancelar"); // Spanish confirm button
    expect(html).toContain('method="POST"');
    expect(h.cancelled).toHaveLength(0); // GET must not cancel
  });

  it("shows the 'nothing to cancel' page for a missing/cancelled booking", async () => {
    const t = bookingManageToken("org_1", "bk_1");
    expect((await GET(new Request(`http://x/api/bookings/cancel?org=org_1&id=bk_1&t=${t}`))).status).toBe(404);
    h.booking = booking({ status: "cancelled" });
    expect((await GET(new Request(`http://x/api/bookings/cancel?org=org_1&id=bk_1&t=${t}`))).status).toBe(404);
  });
});

describe("POST /api/bookings/cancel (perform cancel)", () => {
  function postReq(org: string, id: string, t: string | null) {
    const body = new URLSearchParams({ org, id, t: t ?? "" });
    return new Request("http://x/api/bookings/cancel", { method: "POST", body });
  }

  it("cancels a confirmed booking, notifies the owner, and shows the localized result", async () => {
    h.booking = booking();
    const t = bookingManageToken("org_1", "bk_1")!;
    const res = await POST(postReq("org_1", "bk_1", t));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Reunión cancelada"); // Spanish cancelled title
    expect(html).toContain("https://app.example.com/book/org_1"); // rebook CTA
    expect(h.cancelled).toEqual(["bk_1"]);
    expect(h.ownerEmails.some((e) => e.to === "owner@acme.com" && /Booking cancelled/.test(e.subject))).toBe(true);
  });

  it("rejects a bad token (401) and doesn't cancel", async () => {
    h.booking = booking();
    expect((await POST(postReq("org_1", "bk_1", "bad"))).status).toBe(401);
    expect(h.cancelled).toHaveLength(0);
  });

  it("is a no-op result page when the booking is already gone", async () => {
    h.booking = null;
    const t = bookingManageToken("org_1", "bk_1")!;
    const res = await POST(postReq("org_1", "bk_1", t));
    expect(res.status).toBe(404);
  });
});
