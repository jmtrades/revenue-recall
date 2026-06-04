import { describe, it, expect, beforeEach, vi } from "vitest";

const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { POST as createDeal } from "@/app/api/v1/deals/route";
import { getProvider } from "@/lib/crm/registry";

const KEY = "Bearer rr_live_validlooooooooooong";

function post(body: unknown, auth = KEY) {
  return createDeal(
    new Request("http://x/api/v1/deals", { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body: JSON.stringify(body) }),
  );
}

describe("POST /api/v1/deals (create)", () => {
  beforeEach(() => resolveOrgByApiKey.mockReset());

  it("rejects a missing key (401)", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    expect((await post({ contactId: "c_1" }, "")).status).toBe(401);
  });

  it("400s without a contactId", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    expect((await post({ title: "x" })).status).toBe(400);
  });

  it("404s for an unknown contact", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    expect((await post({ contactId: "does_not_exist" })).status).toBe(404);
  });

  it("creates an open deal for an existing contact (201)", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const contact = await getProvider().createContact({ name: "Deal Target", points: [{ channel: "email", value: `d-${Date.now()}@a.com` }] });
    const res = await post({ contactId: contact.id, title: "New Opp", value: 1234 });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deal.contactId).toBe(contact.id);
    expect(json.deal.value).toBe(1234);
    expect(typeof json.deal.stage).toBe("string");
  });
});
