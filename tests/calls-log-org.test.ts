import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/calls", () => ({ logCallOutcome: vi.fn(async () => ({ id: "act_1" })) }));
vi.mock("@/lib/supabase/org-context", () => ({
  runWithOrg: vi.fn(async (_orgId: string, fn: () => unknown) => fn()),
}));

import { POST } from "@/app/api/calls/log/route";
import { runWithOrg } from "@/lib/supabase/org-context";

afterEach(() => vi.clearAllMocks());

const post = (body: unknown) =>
  new Request("http://localhost/api/calls/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("calls/log routes the transcript to the owning org", () => {
  it("runs the write inside runWithOrg(meta.orgId) so it can't land on the first org", async () => {
    const res = await POST(post({ to: "+15551234567", outcome: "completed", meta: { orgId: "org_77", contactId: "c1" } }));
    expect(res.status).toBe(200);
    expect(vi.mocked(runWithOrg)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runWithOrg).mock.calls[0][0]).toBe("org_77");
  });

  it("logs without an override when no orgId is supplied (back-compat)", async () => {
    const res = await POST(post({ to: "+15551234567", outcome: "completed", meta: { contactId: "c1" } }));
    expect(res.status).toBe(200);
    expect(vi.mocked(runWithOrg)).not.toHaveBeenCalled();
  });
});
