import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { costOf, priceFor, estimateTokens, MODEL_PRICING } from "@/lib/ai/cost";
import { recordUsage, usageSummary, isWithinBudget, monthlyBudgetUsd, _resetUsage } from "@/lib/ai/usage";

beforeEach(() => {
  _resetUsage();
  delete process.env.AI_MONTHLY_BUDGET_USD;
  delete process.env.AI_PRICE_OPUS_IN;
});

describe("ai cost model", () => {
  it("prices by model family, defaulting to opus", () => {
    expect(priceFor("claude-haiku-4-5")).toEqual(MODEL_PRICING.haiku);
    expect(priceFor("claude-sonnet-4-6")).toEqual(MODEL_PRICING.sonnet);
    expect(priceFor("claude-opus-4-8")).toEqual(MODEL_PRICING.opus);
    expect(priceFor("something-unknown")).toEqual(MODEL_PRICING.opus);
  });

  it("computes cost from token counts", () => {
    // opus: $15/M in, $75/M out → 1M in + 1M out = 90
    expect(costOf("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(90, 5);
    expect(costOf("claude-haiku-4-5", 1_000_000, 0)).toBeCloseTo(0.8, 5);
    expect(costOf("x", 0, 0)).toBe(0);
  });

  it("honors env price overrides", () => {
    process.env.AI_PRICE_OPUS_IN = "30";
    expect(priceFor("claude-opus-4-8").inputPerM).toBe(30);
  });

  it("estimates tokens from text length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("usage ledger + budget", () => {
  it("sums this month's cost, tokens, and calls, broken down by feature", async () => {
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 1000, outputTokens: 500, costUsd: 0.0525, feature: "draft" });
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 2000, outputTokens: 1000, costUsd: 0.105, feature: "reply" });
    await recordUsage({ model: "claude-opus-4-8", inputTokens: 500, outputTokens: 200, costUsd: 0.02, feature: "draft" });
    const s = await usageSummary();
    expect(s.calls).toBe(3);
    expect(s.inputTokens).toBe(3500);
    expect(s.costUsd).toBeCloseTo(0.1775, 6);
    expect(s.byFeature.draft).toBeCloseTo(0.0725, 6);
    expect(s.byFeature.reply).toBeCloseTo(0.105, 6);
  });

  it("is unlimited with no budget set", async () => {
    await recordUsage({ model: "m", inputTokens: 0, outputTokens: 0, costUsd: 9999 });
    expect(monthlyBudgetUsd()).toBe(0);
    expect(await isWithinBudget()).toBe(true);
  });

  it("blocks once the monthly budget is exceeded", async () => {
    process.env.AI_MONTHLY_BUDGET_USD = "10";
    await recordUsage({ model: "m", inputTokens: 0, outputTokens: 0, costUsd: 4 });
    expect(await isWithinBudget()).toBe(true);
    await recordUsage({ model: "m", inputTokens: 0, outputTokens: 0, costUsd: 7 }); // total 11 > 10
    expect(await isWithinBudget()).toBe(false);
  });
});
