import { describe, it, expect } from "vitest";
import { annualMonthly } from "@/components/marketing/PricingPlans";

describe("annual pricing", () => {
  it("gives ~2 months free (charges for 10 of 12 months)", () => {
    expect(annualMonthly(49)).toBe(41); // round(49 * 10/12)
    expect(annualMonthly(120)).toBe(100);
  });

  it("is never more than the monthly price", () => {
    for (const m of [9, 29, 49, 99, 199]) expect(annualMonthly(m)).toBeLessThan(m);
  });

  it("keeps free as free", () => {
    expect(annualMonthly(0)).toBe(0);
  });
});
