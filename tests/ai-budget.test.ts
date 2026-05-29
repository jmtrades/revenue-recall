import { describe, it, expect, afterEach } from "vitest";
import { minEffort, maxEffort, effortCeiling } from "@/lib/ai/client";
import { budgetFraction, recordUsage, _resetUsage } from "@/lib/ai/usage";

afterEach(() => {
  _resetUsage();
  delete process.env.AI_MONTHLY_BUDGET_USD;
});

describe("effort ordering helpers", () => {
  it("maxEffort raises, minEffort lowers, undefined-safe", () => {
    expect(maxEffort("high", "low")).toBe("high");
    expect(maxEffort("medium", undefined)).toBe("medium");
    expect(minEffort("xhigh", "medium")).toBe("medium");
    expect(minEffort(undefined, "low")).toBe("low");
    expect(minEffort(undefined, undefined)).toBeUndefined();
  });
});

describe("effortCeiling (budget-aware glide)", () => {
  it("no ceiling with headroom, tightening as spend nears the cap", () => {
    expect(effortCeiling(0)).toBeUndefined();
    expect(effortCeiling(0.5)).toBeUndefined();
    expect(effortCeiling(0.8)).toBe("high");
    expect(effortCeiling(0.92)).toBe("medium");
    expect(effortCeiling(0.99)).toBe("low");
  });

  it("clamps a maxed request down under pressure (the real effect)", () => {
    // requested "max", but 92% of budget spent → ceiling "medium" wins
    expect(minEffort("max", effortCeiling(0.92))).toBe("medium");
    // plenty of headroom → request stands
    expect(minEffort("max", effortCeiling(0.3))).toBe("max");
  });
});

describe("budgetFraction", () => {
  it("is 0 when no budget cap is set (unlimited)", async () => {
    delete process.env.AI_MONTHLY_BUDGET_USD;
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 1000, outputTokens: 1000, costUsd: 5, feature: "draft" });
    expect(await budgetFraction()).toBe(0);
  });

  it("reflects spend against the cap", async () => {
    process.env.AI_MONTHLY_BUDGET_USD = "10";
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 0, outputTokens: 0, costUsd: 7.5, feature: "draft" });
    expect(await budgetFraction()).toBeCloseTo(0.75, 5);
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 0, outputTokens: 0, costUsd: 3, feature: "draft" });
    expect(await budgetFraction()).toBeGreaterThanOrEqual(1); // over cap
  });
});
