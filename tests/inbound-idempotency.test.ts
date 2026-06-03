import { describe, it, expect, vi, beforeEach } from "vitest";

const { handleInbound, seenInboundEvent } = vi.hoisted(() => ({
  handleInbound: vi.fn(async () => ({ matched: false })),
  seenInboundEvent: vi.fn(async () => false),
}));
vi.mock("@/lib/inbound", () => ({ handleInbound }));
vi.mock("@/lib/inbound-dedup", () => ({ seenInboundEvent }));

import { POST } from "@/app/api/inbound/sms/route";

beforeEach(() => {
  vi.clearAllMocks();
  seenInboundEvent.mockResolvedValue(false);
});

const smsReq = (params: Record<string, string>) =>
  new Request("http://localhost/api/inbound/sms", { method: "POST", body: new URLSearchParams(params) });

describe("inbound SMS idempotency", () => {
  it("processes a first-seen message", async () => {
    const res = await POST(smsReq({ From: "+15551234567", Body: "hi", MessageSid: "SM1" }));
    expect(res.status).toBe(200);
    expect(handleInbound).toHaveBeenCalledTimes(1);
  });

  it("no-ops a retried duplicate (same MessageSid) — no second auto-reply", async () => {
    seenInboundEvent.mockResolvedValue(true);
    const res = await POST(smsReq({ From: "+15551234567", Body: "hi", MessageSid: "SM1" }));
    expect(res.status).toBe(200);
    expect(handleInbound).not.toHaveBeenCalled();
  });
});
