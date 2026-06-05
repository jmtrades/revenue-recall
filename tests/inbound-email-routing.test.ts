import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the org scope + the handler call so we can prove an org-tagged inbound
// request runs inside runWithOrg(org) and a legacy one does not.
const { handleInbound, runWithOrg } = vi.hoisted(() => ({
  handleInbound: vi.fn(async () => ({ matched: true, action: "queued" })),
  runWithOrg: vi.fn(async (_org: string, fn: () => unknown) => fn()),
}));
vi.mock("@/lib/inbound", () => ({ handleInbound }));
vi.mock("@/lib/supabase/org-context", () => ({ runWithOrg }));

import { POST } from "@/app/api/inbound/email/route";
import { inboundOrgToken } from "@/lib/inbound-routing";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INBOUND_SIGNING_SECRET;
  delete process.env.INBOUND_TOKEN;
});

const post = (qs: string, body: object) =>
  POST(new Request(`http://x/api/inbound/email${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("inbound email multi-tenant routing", () => {
  it("routes an org-tagged request into runWithOrg(org)", async () => {
    const org = "org_abc";
    const t = inboundOrgToken(org)!;
    const res = await post(`?org=${org}&t=${t}`, { from: "a@b.com", text: "hi there" });
    expect(res.status).toBe(200);
    expect(runWithOrg).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runWithOrg).mock.calls[0][0]).toBe(org);
    expect(handleInbound).toHaveBeenCalledWith("email", "a@b.com", "hi there", undefined);
  });

  it("rejects an org-tagged request with a bad token (401), never processing it", async () => {
    const res = await post(`?org=org_abc&t=not-the-token`, { from: "a@b.com", text: "hi" });
    expect(res.status).toBe(401);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("processes a legacy (no-org) request without runWithOrg (back-compat)", async () => {
    // No global secret set + non-prod → the open-with-warning legacy path.
    const res = await post("", { from: "a@b.com", text: "hi" });
    expect(res.status).toBe(200);
    expect(runWithOrg).not.toHaveBeenCalled();
    expect(handleInbound).toHaveBeenCalledTimes(1);
  });
});
