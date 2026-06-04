import { describe, it, expect } from "vitest";
import { effectiveSeats } from "@/lib/billing/entitlements";

describe("effectiveSeats", () => {
  it("grants per-seat plans every seat they paid for (not just the plan minimum)", () => {
    // growth is perSeat with a static cap of 1 — a customer who bought 5 must get 5.
    expect(effectiveSeats("growth", 5)).toBe(5);
    expect(effectiveSeats("growth", 1)).toBe(1);
    expect(effectiveSeats("growth", 0)).toBe(1); // never below 1
  });

  it("uses the fixed cap for flat plans regardless of quantity", () => {
    expect(effectiveSeats("team", 99)).toBe(5); // flat 5-seat plan
    expect(effectiveSeats("free", 99)).toBe(1);
  });

  it("keeps unlimited unlimited", () => {
    expect(effectiveSeats("scale", 3)).toBe(Infinity);
  });
});
