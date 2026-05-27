import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).ok).toBe(true);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = `w:${Math.random()}`;
    expect(rateLimit(key, 1, 1).ok).toBe(true);
    // window of 1ms — a later call starts a fresh window
    const later = Date.now() + 5;
    while (Date.now() < later) {
      /* spin briefly */
    }
    expect(rateLimit(key, 1, 1).ok).toBe(true);
  });
});
