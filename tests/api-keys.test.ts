import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateApiKey, hashApiKey, keyPrefix, maskApiKey, looksLikeApiKey, readApiKey, API_KEY_PREFIX } from "@/lib/api-keys";

// Mock the server-side org resolver so we can exercise the public endpoint
// against the in-memory CRM without a database. (vi.hoisted: the factory runs
// before module init, so the mock fn exists when the route imports it.)
const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { POST as captureLead } from "@/app/api/v1/leads/route";

describe("api-keys lib", () => {
  it("generates a well-formed key, hash, and display prefix", () => {
    const a = generateApiKey();
    expect(a.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.key.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 32);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.prefix).toBe(keyPrefix(a.key));
    expect(a.key.startsWith(a.prefix)).toBe(true);
  });

  it("hashes deterministically and uniquely per key", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1.key).not.toBe(k2.key);
    expect(hashApiKey(k1.key)).toBe(hashApiKey(k1.key));
    expect(hashApiKey(k1.key)).not.toBe(hashApiKey(k2.key));
  });

  it("masks without leaking the secret and validates shape", () => {
    const { key, prefix } = generateApiKey();
    expect(maskApiKey(prefix)).toContain("•");
    expect(maskApiKey(prefix)).not.toBe(key);
    expect(looksLikeApiKey(key)).toBe(true);
    expect(looksLikeApiKey("nope")).toBe(false);
    expect(looksLikeApiKey(`${API_KEY_PREFIX}short`)).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });

  it("reads the key from Authorization Bearer or x-api-key", () => {
    expect(readApiKey(new Headers({ authorization: "Bearer rr_live_abc" }))).toBe("rr_live_abc");
    expect(readApiKey(new Headers({ "x-api-key": "rr_live_xyz" }))).toBe("rr_live_xyz");
    expect(readApiKey(new Headers())).toBeNull();
  });
});

describe("POST /api/v1/leads", () => {
  beforeEach(() => {
    resolveOrgByApiKey.mockReset();
  });

  function req(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://x/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects a missing/unknown API key with 401", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    const res = await captureLead(req({ name: "Jane", email: "jane@acme.com" }));
    expect(res.status).toBe(401);
  });

  it("rejects a lead with no email or phone (400)", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await captureLead(req({ name: "Jane" }, { authorization: "Bearer rr_live_validlooooooooooong" }));
    expect(res.status).toBe(400);
  });

  it("creates a contact + open deal for a valid key (201)", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await captureLead(
      req(
        { name: "Jane Doe", email: "jane@acme.com", company: "Acme", value: 5000, source: "website" },
        { authorization: "Bearer rr_live_validlooooooooooong" },
      ),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.contactId).toBe("string");
    expect(typeof json.dealId).toBe("string");
    expect(json.enrolled).toBe(false);
  });
});
