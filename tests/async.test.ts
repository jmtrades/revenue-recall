import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/async";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const items = [30, 10, 20, 0];
    const out = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms * 2;
    });
    expect(out.map((r) => (r.ok ? r.value : null))).toEqual([60, 20, 40, 0]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // actually ran in parallel
  });

  it("isolates failures — one rejection doesn't abort the rest", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    expect(out[0]).toEqual({ ok: true, value: 10 });
    expect(out[1].ok).toBe(false);
    expect(out[2]).toEqual({ ok: true, value: 30 });
  });

  it("handles an empty list and clamps the worker count", async () => {
    expect(await mapWithConcurrency([], 8, async (x) => x)).toEqual([]);
    const out = await mapWithConcurrency([1], 100, async (x) => x + 1);
    expect(out).toEqual([{ ok: true, value: 2 }]);
  });

  it("runs every item exactly once", async () => {
    const seen = new Set<number>();
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 7, async (i) => {
      seen.add(i);
      return i;
    });
    expect(seen.size).toBe(50);
    expect(out.filter((r) => r.ok)).toHaveLength(50);
  });
});
