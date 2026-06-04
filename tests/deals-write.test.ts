import { describe, it, expect, beforeEach, vi } from "vitest";

const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { dealEvent } from "@/lib/deals";
import { PATCH as patchDeal } from "@/app/api/v1/deals/[id]/route";
import { getProvider } from "@/lib/crm/registry";

const KEY = "Bearer rr_live_validlooooooooooong";

describe("dealEvent mapping", () => {
  it("maps stage type to the lifecycle event", () => {
    expect(dealEvent("won")).toBe("deal.won");
    expect(dealEvent("lost")).toBe("deal.lost");
    expect(dealEvent("open")).toBe("deal.stage_changed");
    expect(dealEvent(undefined)).toBe("deal.stage_changed");
  });
});

function patch(id: string, body: unknown, auth = KEY) {
  const req = new Request(`http://x/api/v1/deals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(body),
  });
  return patchDeal(req, { params: { id } });
}

describe("PATCH /api/v1/deals/:id", () => {
  beforeEach(() => resolveOrgByApiKey.mockReset());

  it("rejects a missing key (401)", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    const res = await patch("o_x", { status: "won" }, "");
    expect(res.status).toBe(401);
  });

  it("400s when neither stageId nor status is given", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const opps = await getProvider().listOpportunities();
    const res = await patch(opps[0].id, {});
    expect(res.status).toBe(400);
  });

  it("404s for an unknown deal", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await patch("does_not_exist", { status: "won" });
    expect(res.status).toBe(404);
  });

  it("marks a real deal won", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const opps = await getProvider().listOpportunities();
    const res = await patch(opps[0].id, { status: "won" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deal.id).toBe(opps[0].id);
    expect(typeof json.deal.stage).toBe("string");
  });
});
