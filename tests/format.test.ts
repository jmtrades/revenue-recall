import { describe, it, expect } from "vitest";
import { money, pct } from "@/lib/format";

describe("money", () => {
  it("formats normal values", () => {
    expect(money(0)).toBe("$0");
    expect(money(1500)).toBe("$1,500");
    expect(money(2500000)).toContain("2.5"); // compact for ≥$1M
  });
  it("never renders $NaN on a bad input", () => {
    expect(money(NaN)).toBe("$0");
    expect(money(Infinity)).toBe("$0");
    expect(money(-Infinity)).toBe("$0");
  });
});

describe("pct", () => {
  it("rounds a ratio to a whole percent", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0)).toBe("0%");
  });
  it("never renders NaN% on a bad input", () => {
    expect(pct(NaN)).toBe("0%");
    expect(pct(Infinity)).toBe("0%");
  });
});
