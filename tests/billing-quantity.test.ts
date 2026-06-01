import { describe, it, expect } from "vitest";
import { checkoutQuantity } from "@/lib/billing/stripe";
import { PLANS, getPlan } from "@/lib/billing/plans";

// Regression guard: a larger team must never inflate a FLAT plan's price into
// seats × price at Stripe checkout. Only the per-rep plan (Operator) scales.
describe("checkout quantity — no flat-plan overcharge", () => {
  it("bills Operator (growth) per rep: quantity = seats", () => {
    expect(checkoutQuantity("growth", 1)).toBe(1);
    expect(checkoutQuantity("growth", 3)).toBe(3);
  });

  it("bills flat plans once regardless of team size", () => {
    expect(checkoutQuantity("team", 5)).toBe(1); // $549 flat — NOT $549 × 5
    expect(checkoutQuantity("scale", 20)).toBe(1);
    expect(checkoutQuantity("free", 9)).toBe(1);
  });

  it("never drops below 1", () => {
    expect(checkoutQuantity("growth", 0)).toBe(1);
    expect(checkoutQuantity("growth", -5)).toBe(1);
  });
});

describe("plan catalog is internally consistent", () => {
  it("only Operator is per-seat", () => {
    expect(getPlan("growth").perSeat).toBe(true);
    for (const id of ["free", "team", "scale"] as const) expect(getPlan(id).perSeat).toBe(false);
  });

  it("purchasable plans carry a real dollar price", () => {
    for (const p of PLANS.filter((pl) => pl.purchasable)) expect(p.price).toMatch(/^\$\d/);
  });
});
