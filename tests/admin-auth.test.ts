import { describe, it, expect, beforeEach } from "vitest";
import { requireAdmin } from "@/lib/admin";
import { _resetRateLimit } from "@/lib/ratelimit";

function req(token?: string): Request {
  return new Request("https://x/api/admin/bootstrap", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  _resetRateLimit();
  process.env.ADMIN_TOKEN = "secret-admin-token-1234567890";
});

describe("requireAdmin", () => {
  it("authorizes a correct bearer token (returns null = proceed)", () => {
    expect(requireAdmin(req("secret-admin-token-1234567890"), "t1")).toBeNull();
  });

  it("rejects a wrong or missing token with 401", () => {
    expect(requireAdmin(req("nope"), "t2")?.status).toBe(401);
    expect(requireAdmin(req(), "t3")?.status).toBe(401);
  });

  it("rejects when ADMIN_TOKEN is unset (never open)", () => {
    delete process.env.ADMIN_TOKEN;
    expect(requireAdmin(req("anything"), "t4")?.status).toBe(401);
  });

  it("rate-limits brute force (429 once over the per-minute cap)", () => {
    for (let i = 0; i < 10; i++) requireAdmin(req("nope"), "rl");
    expect(requireAdmin(req("nope"), "rl")?.status).toBe(429);
  });
});
