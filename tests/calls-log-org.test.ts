import { describe, it, expect, vi, afterEach } from "vitest";

const { logCallOutcome, scheduleCallRetry, scheduleVoicemailFollowup, seenInboundEvent } = vi.hoisted(() => ({
  logCallOutcome: vi.fn(async () => ({ id: "act_1" })),
  scheduleCallRetry: vi.fn(async () => null),
  scheduleVoicemailFollowup: vi.fn(async () => ({ queued: false })),
  seenInboundEvent: vi.fn(async () => false),
}));
vi.mock("@/lib/calls", () => ({ logCallOutcome, scheduleCallRetry, scheduleVoicemailFollowup }));
vi.mock("@/lib/supabase/org-context", () => ({
  runWithOrg: vi.fn(async (_orgId: string, fn: () => unknown) => fn()),
}));
vi.mock("@/lib/inbound-dedup", () => ({ seenInboundEvent }));

import { POST } from "@/app/api/calls/log/route";
import { runWithOrg } from "@/lib/supabase/org-context";

afterEach(() => {
  vi.clearAllMocks();
  seenInboundEvent.mockResolvedValue(false);
});

const post = (body: unknown) =>
  new Request("http://localhost/api/calls/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("calls/log routes the transcript to the owning org", () => {
  it("runs the write inside runWithOrg(meta.orgId) so it can't land on the first org", async () => {
    // Org-addressed metas must carry the HMAC the place route attaches.
    process.env.ENCRYPTION_KEY = "test-key-at-least-16-chars-long";
    const { signCallMeta } = await import("@/lib/calls/meta-sig");
    const res = await POST(post({ to: "+15551234567", outcome: "completed", meta: signCallMeta({ orgId: "org_77", contactId: "c1" }) }));
    expect(res.status).toBe(200);
    expect(vi.mocked(runWithOrg)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runWithOrg).mock.calls[0][0]).toBe("org_77");
  });

  it("rejects an org-addressed post-back without a valid signature (401)", async () => {
    process.env.ENCRYPTION_KEY = "test-key-at-least-16-chars-long";
    const res = await POST(post({ to: "+15551234567", outcome: "completed", meta: { orgId: "org_77", contactId: "c1" } }));
    expect(res.status).toBe(401);
  });

  it("logs without an override when no orgId is supplied (back-compat)", async () => {
    const res = await POST(post({ to: "+15551234567", outcome: "completed", meta: { contactId: "c1" } }));
    expect(res.status).toBe(200);
    expect(vi.mocked(runWithOrg)).not.toHaveBeenCalled();
  });

  it("no-ops a retried post-back with the same callId (idempotent)", async () => {
    seenInboundEvent.mockResolvedValue(true);
    const res = await POST(post({ callId: "call_1", to: "+15551234567", outcome: "completed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(logCallOutcome).not.toHaveBeenCalled();
  });
});
