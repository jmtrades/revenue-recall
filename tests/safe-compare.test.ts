import { describe, it, expect } from "vitest";
import { safeEqual } from "@/lib/safe-compare";

describe("safeEqual (constant-time string equality)", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc123")).toBe(true);
    expect(safeEqual("Bearer abc123", "Bearer abc124")).toBe(false);
  });
  it("handles differing lengths without throwing", () => {
    expect(safeEqual("short", "a-much-longer-token")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("x", "")).toBe(false);
  });
  it("is exact (no prefix match)", () => {
    expect(safeEqual("Bearer abc", "Bearer abcdef")).toBe(false);
  });
});
