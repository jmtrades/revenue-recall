import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Booking } from "@/lib/meetings/types";
import { isPublicRoute } from "@/lib/route-access";

/**
 * /api/meetings/status: a rep marks a booking outcome. In-app + auth-gated
 * (under /api/meetings, NOT the public /api/bookings prefix). The store + the
 * provider are mocked.
 */
const h = vi.hoisted(() => ({
  booking: null as Booking | null,
  setCalls: [] as Array<{ id: string; status: string }>,
  activities: [] as string[],
  webhooks: [] as string[],
}));

vi.mock("@/lib/webhooks-out", async (orig) => ({
  ...(await orig<typeof import("@/lib/webhooks-out")>()),
  emitWebhook: vi.fn(async (event: string) => {
    h.webhooks.push(event);
  }),
}));

vi.mock("@/lib/meetings/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/meetings/store")>()),
  getBooking: vi.fn(async () => h.booking),
  setBookingStatus: vi.fn(async (id: string, status: string) => {
    h.setCalls.push({ id, status });
  }),
}));
vi.mock("@/lib/crm/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/crm/registry")>()),
  resolveProvider: vi.fn(async () => ({ logActivity: vi.fn(async (a: { summary: string }) => { h.activities.push(a.summary); return {}; }) })),
}));

import { POST } from "@/app/api/meetings/status/route";
import { _resetRateLimit } from "@/lib/ratelimit";

function booking(p: Partial<Booking> = {}): Booking {
  return { id: "bk_1", meetingTypeId: null, meetingName: "Intro call", durationMinutes: 30, contactId: "c1", dealId: "d1", inviteeName: "Pat", startsAt: "", endsAt: "", timezone: "UTC", status: "confirmed", createdAt: "", ...p };
}
function req(body: unknown) {
  return new Request("http://x/api/meetings/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  h.booking = null;
  h.setCalls = [];
  h.activities = [];
  h.webhooks = [];
  _resetRateLimit();
});

describe("route gating", () => {
  it("keeps the status endpoint authenticated (not public) and the page gated", () => {
    expect(isPublicRoute("/api/meetings/status")).toBe(false);
    expect(isPublicRoute("/meetings")).toBe(false);
    // The public booking endpoints stay public.
    expect(isPublicRoute("/api/bookings/create")).toBe(true);
  });
});

describe("POST /api/meetings/status", () => {
  it("rejects an invalid status (400)", async () => {
    h.booking = booking();
    expect((await POST(req({ id: "bk_1", status: "bogus" }))).status).toBe(400);
    expect(h.setCalls).toHaveLength(0);
  });

  it("404s a missing booking", async () => {
    expect((await POST(req({ id: "bk_x", status: "completed" }))).status).toBe(404);
  });

  it("marks the outcome and logs a timeline note", async () => {
    h.booking = booking();
    const res = await POST(req({ id: "bk_1", status: "no_show" }));
    expect(res.status).toBe(200);
    expect(h.setCalls).toEqual([{ id: "bk_1", status: "no_show" }]);
    expect(h.activities.some((a) => /no-show/.test(a))).toBe(true);
    expect(h.webhooks).toContain("meeting.no_show");
  });
});
