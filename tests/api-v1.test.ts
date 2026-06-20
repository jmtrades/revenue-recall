import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the org resolver so the public endpoints run against the in-memory CRM
// without a database. (vi.hoisted: factory runs before the route imports it.)
const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { GET as listLeads } from "@/app/api/v1/leads/route";
import { GET as listDeals } from "@/app/api/v1/deals/route";
import { _resetRateLimit } from "@/lib/ratelimit";

const KEY = "Bearer rr_live_validlooooooooooong";

describe("public API v1 read endpoints", () => {
  beforeEach(() => {
    resolveOrgByApiKey.mockReset();
    _resetRateLimit(); // isolate per-IP + per-org buckets across cases
  });

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

describe("public API v1 per-workspace rate limit", () => {
  beforeEach(() => {
    resolveOrgByApiKey.mockReset();
    _resetRateLimit();
  });
  afterEach(() => {
    delete process.env.API_RATE_LIMIT_PER_MIN;
  });

  it("caps a single workspace key regardless of source, then 429s", async () => {
    process.env.API_RATE_LIMIT_PER_MIN = "2"; // tiny cap for the test
    resolveOrgByApiKey.mockResolvedValue("org_capped");
    const call = (ip: string) =>
      listLeads(new Request("http://x/api/v1/leads", { headers: { authorization: KEY, "x-forwarded-for": ip } }));
    // Two allowed within the window…
    expect((await call("1.1.1.1")).status).toBe(200);
    expect((await call("2.2.2.2")).status).toBe(200);
    // …a third from yet another IP is still blocked — the cap is per WORKSPACE,
    // so rotating source IPs (which would defeat an IP-only limit) doesn't help.
    expect((await call("3.3.3.3")).status).toBe(429);
  });

  it("does not leak the cap across workspaces", async () => {
    process.env.API_RATE_LIMIT_PER_MIN = "1";
    resolveOrgByApiKey.mockResolvedValueOnce("org_a").mockResolvedValueOnce("org_b");
    expect((await listLeads(new Request("http://x/api/v1/leads", { headers: { authorization: KEY } }))).status).toBe(200);
    // A different workspace gets its own fresh budget.
    expect((await listLeads(new Request("http://x/api/v1/leads", { headers: { authorization: KEY } }))).status).toBe(200);
  });
});
