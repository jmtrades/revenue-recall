import { describe, it, expect } from "vitest";
import { seatBudget } from "@/lib/invites";

describe("seatBudget (plan seat enforcement)", () => {
  it("never blocks on an unlimited plan", () => {
    expect(seatBudget(100, 50, Infinity)).toEqual({ remaining: Infinity, exceeded: false });
  });

  it("allows additions that fit within the cap", () => {
    expect(seatBudget(3, 2, 5)).toEqual({ remaining: 2, exceeded: false }); // 3 used + 2 = 5
    expect(seatBudget(4, 1, 5).exceeded).toBe(false);
  });

  it("blocks additions that exceed the remaining seats", () => {
    expect(seatBudget(4, 2, 5).exceeded).toBe(true); // 4 used + 2 = 6 > 5
    expect(seatBudget(1, 1, 1).exceeded).toBe(true); // single-seat plan, already used
  });

  it("clamps remaining at zero when already over", () => {
    expect(seatBudget(7, 1, 5)).toEqual({ remaining: 0, exceeded: true });
  });
});
