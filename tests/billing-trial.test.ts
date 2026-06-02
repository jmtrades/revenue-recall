import { describe, it, expect, afterEach, vi } from "vitest";
import { trialDays } from "@/lib/billing/stripe";

afterEach(() => vi.unstubAllEnvs());

describe("trialDays (card-required free trial length)", () => {
  it("defaults to 14 days", () => {
    vi.stubEnv("STRIPE_TRIAL_DAYS", "");
    expect(trialDays()).toBe(14);
  });
  it("honors a valid override", () => {
    vi.stubEnv("STRIPE_TRIAL_DAYS", "7");
    expect(trialDays()).toBe(7);
  });
  it("allows 0 to disable trials (charge immediately)", () => {
    vi.stubEnv("STRIPE_TRIAL_DAYS", "0");
    expect(trialDays()).toBe(0);
  });
  it("falls back to 14 on garbage or negative input", () => {
    vi.stubEnv("STRIPE_TRIAL_DAYS", "-5");
    expect(trialDays()).toBe(14);
    vi.stubEnv("STRIPE_TRIAL_DAYS", "banana");
    expect(trialDays()).toBe(14);
  });
});
