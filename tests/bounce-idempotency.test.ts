import { describe, it, expect, vi, beforeEach } from "vitest";

const { markEmailBounced, seenInboundEvent, forgetInboundEvent } = vi.hoisted(() => ({
  markEmailBounced: vi.fn(async (_email: string) => 1),
  seenInboundEvent: vi.fn(async (_provider: string, _key: string) => false),
  forgetInboundEvent: vi.fn(async (_provider: string, _key: string) => undefined),
}));
vi.mock("@/lib/bounce", () => ({ markEmailBounced }));
vi.mock("@/lib/inbound-dedup", () => ({ seenInboundEvent, forgetInboundEvent }));

import { POST } from "@/app/api/inbound/bounce/route";

beforeEach(() => {
  vi.clearAllMocks();
  seenInboundEvent.mockResolvedValue(false);
  delete process.env.INBOUND_SIGNING_SECRET;
  delete process.env.INBOUND_TOKEN;
  // Route is dev-open without a secret; tests assert the dedup behavior, not auth.
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
});

const bounceReq = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/inbound/bounce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("inbound bounce idempotency", () => {
  it("processes a first-seen hard bounce", async () => {
    const res = await POST(bounceReq({ email: "dead@x.com", type: "hard", id: "evt_1" }));
    expect(res.status).toBe(200);
    expect(markEmailBounced).toHaveBeenCalledWith("dead@x.com");
  });

  it("no-ops a retried duplicate (same event id) — no second suppression/log", async () => {
    seenInboundEvent.mockResolvedValue(true);
    const res = await POST(bounceReq({ email: "dead@x.com", type: "hard", id: "evt_1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(markEmailBounced).not.toHaveBeenCalled();
  });

  it("accepts the common ESP id field names", async () => {
    await POST(bounceReq({ email: "a@x.com", type: "hard", messageId: "m1" }));
    await POST(bounceReq({ email: "b@x.com", type: "hard", eventId: "e1" }));
    const keys = seenInboundEvent.mock.calls.map((c) => c[1]);
    expect(keys).toEqual(["default:m1", "default:e1"]);
  });

  it("forgets the dedup key when processing throws, so a retry can reprocess", async () => {
    markEmailBounced.mockRejectedValueOnce(new Error("db down"));
    // withGuard catches the re-thrown error and returns a 500 (doesn't reject);
    // the point is that forget ran first, so the provider's retry isn't deduped.
    const res = await POST(bounceReq({ email: "dead@x.com", type: "hard", id: "evt_2" }));
    expect(res.status).toBe(500);
    expect(forgetInboundEvent).toHaveBeenCalledWith("bounce", "default:evt_2");
  });

  it("still works with no event id (relies on markEmailBounced's effective idempotency)", async () => {
    const res = await POST(bounceReq({ email: "dead@x.com", type: "hard" }));
    expect(res.status).toBe(200);
    expect(seenInboundEvent).not.toHaveBeenCalled();
    expect(markEmailBounced).toHaveBeenCalledWith("dead@x.com");
  });
});
