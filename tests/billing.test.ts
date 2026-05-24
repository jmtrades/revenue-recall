import { describe, it, expect } from "vitest";
import {
  PLANS,
  assertMargins,
  grossMarginAtMax,
  getPlan,
  MARGIN_FLOOR,
  COST_PER_ACTION,
  CREDIT_PRICE_PER_ACTION,
  CREDIT_PACKS,
} from "@/lib/billing/plans";

describe("pricing margins", () => {
  it("every paid plan clears the margin floor at max usage (assertMargins)", () => {
    expect(() => assertMargins()).not.toThrow();
  });

  it("growth and scale stay >= 90% margin, monthly and annual", () => {
    for (const id of ["growth", "scale"] as const) {
      for (const cycle of ["monthly", "annual"] as const) {
        const m = grossMarginAtMax(PLANS[id], cycle);
        expect(m).not.toBeNull();
        expect(m as number).toBeGreaterThanOrEqual(MARGIN_FLOOR);
      }
    }
  });

  it("AI credits are priced at >= 90% margin", () => {
    const perAction = (CREDIT_PRICE_PER_ACTION - COST_PER_ACTION) / CREDIT_PRICE_PER_ACTION;
    expect(perAction).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    for (const pack of CREDIT_PACKS) {
      const margin = (pack.price - pack.actions * COST_PER_ACTION) / pack.price;
      expect(margin).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    }
  });

  it("getPlan falls back to starter for unknown / missing ids", () => {
    expect(getPlan(undefined).id).toBe("starter");
    expect(getPlan("nonsense").id).toBe("starter");
    expect(getPlan("growth").id).toBe("growth");
  });

  it("free and custom plans are not margin-constrained", () => {
    expect(grossMarginAtMax(PLANS.starter, "monthly")).toBeNull();
    expect(grossMarginAtMax(PLANS.enterprise, "monthly")).toBeNull();
  });
});
