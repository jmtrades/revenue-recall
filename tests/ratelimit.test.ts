import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, clientKey, _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => _resetRateLimit());

describe("rateLimit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = rateLimit("k", 5, 1000, t0);
      expect(r.ok).toBe(true);
    }
    const blocked = rateLimit("k", 5, 1000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k2", 5, 1000, t0);
    expect(rateLimit("k2", 5, 1000, t0).ok).toBe(false);
    // After the window, the counter resets.
    expect(rateLimit("k2", 5, 1000, t0 + 1001).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const t0 = 3_000_000;
    rateLimit("a", 1, 1000, t0);
    expect(rateLimit("a", 1, 1000, t0).ok).toBe(false);
    expect(rateLimit("b", 1, 1000, t0).ok).toBe(true);
  });

  it("reports decreasing remaining", () => {
    const t0 = 4_000_000;
    expect(rateLimit("c", 3, 1000, t0).remaining).toBe(2);
    expect(rateLimit("c", 3, 1000, t0).remaining).toBe(1);
    expect(rateLimit("c", 3, 1000, t0).remaining).toBe(0);
  });

  it("derives a client key from proxy headers", () => {
    const req = new Request("http://x/api/search", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    expect(clientKey(req, "search")).toBe("search:203.0.113.7");
    const anon = new Request("http://x/api/search");
    expect(clientKey(anon, "search")).toBe("search:unknown");
  });
});
