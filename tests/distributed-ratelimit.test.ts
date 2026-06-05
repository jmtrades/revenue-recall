import { describe, it, expect, beforeEach } from "vitest";
import { distributedRateLimit, cleanupRateLimits, _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("distributedRateLimit (in-memory fallback when Supabase is absent)", () => {
  it("caps after the limit within the window", async () => {
    for (let i = 0; i < 3; i++) expect((await distributedRateLimit("k1", 3, 60_000)).ok).toBe(true);
    expect((await distributedRateLimit("k1", 3, 60_000)).ok).toBe(false); // 4th blocked
  });

  it("resets in a new window", async () => {
    const t = 1_000_000;
    expect((await distributedRateLimit("k2", 1, 1000, t)).ok).toBe(true);
    expect((await distributedRateLimit("k2", 1, 1000, t)).ok).toBe(false);
    expect((await distributedRateLimit("k2", 1, 1000, t + 1000)).ok).toBe(true); // next window
  });

  it("cleanupRateLimits is a safe no-op without Supabase", async () => {
    await expect(cleanupRateLimits()).resolves.toBeUndefined();
  });
});
