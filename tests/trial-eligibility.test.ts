import { describe, it, expect } from "vitest";
import { canStartTrial } from "@/lib/billing/trial";

describe("canStartTrial", () => {
  it("allows a brand-new or churned account to start a trial", () => {
    expect(canStartTrial("none")).toBe(true);
    expect(canStartTrial("canceled")).toBe(true);
  });
  it("never re-prompts a live subscription", () => {
    expect(canStartTrial("trialing")).toBe(false);
    expect(canStartTrial("active")).toBe(false);
    expect(canStartTrial("past_due")).toBe(false);
  });
});
