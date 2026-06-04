import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the org resolver so the public endpoints run against the in-memory CRM
// without a database. (vi.hoisted: factory runs before the route imports it.)
const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { GET as listLeads } from "@/app/api/v1/leads/route";
import { GET as listDeals } from "@/app/api/v1/deals/route";

const KEY = "Bearer rr_live_validlooooooooooong";

describe("public API v1 read endpoints", () => {
  beforeEach(() => resolveOrgByApiKey.mockReset());

  it("GET /api/v1/leads rejects a missing key (401)", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    const res = await listLeads(new Request("http://x/api/v1/leads"));
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/leads returns a stable list for a valid key", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await listLeads(new Request("http://x/api/v1/leads?limit=5", { headers: { authorization: KEY } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeLessThanOrEqual(5);
    if (json.data[0]) {
      expect(json.data[0]).toHaveProperty("id");
      expect(json.data[0]).toHaveProperty("name");
      expect(json.data[0]).toHaveProperty("email");
    }
  });

  it("GET /api/v1/deals rejects a missing key (401)", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    const res = await listDeals(new Request("http://x/api/v1/deals"));
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/deals returns a stable list for a valid key", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await listDeals(new Request("http://x/api/v1/deals", { headers: { authorization: KEY } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    if (json.data[0]) {
      expect(json.data[0]).toHaveProperty("id");
      expect(json.data[0]).toHaveProperty("title");
      expect(json.data[0]).toHaveProperty("stage");
    }
  });
});
