import { describe, it, expect, beforeEach } from "vitest";
import { usageMeter, recordUsage, isWithinActionAllowance, _resetUsage } from "@/lib/ai/usage";
import { entitlements } from "@/lib/billing/entitlements";
import { TOPUP_PACKS, getTopupPack } from "@/lib/billing/topups";

// In-memory path (no Supabase) → free plan, no purchased credits.
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  _resetUsage();
});

describe("plan action allowances", () => {
  it("matches the marketing pools", () => {
    expect(entitlements("free").actionsPerMonth).toBe(50);
    expect(entitlements("growth").actionsPerMonth).toBe(1500);
    expect(entitlements("team").actionsPerMonth).toBe(10000);
    expect(Number.isFinite(entitlements("scale").actionsPerMonth)).toBe(false); // unlimited
  });
});

describe("usage meter", () => {
  it("internal refine/health calls don't burn the customer's allowance", async () => {
    await recordUsage({ model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, feature: "draft" });
    await recordUsage({ model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, feature: "draft.refine" });
    await recordUsage({ model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, feature: "health" });
    const m = await usageMeter();
    expect(m.used).toBe(1); // one customer-visible action, not three calls
  });

  it("starts at the included allowance and decrements as actions are used", async () => {
    const before = await usageMeter();
    expect(before.unlimited).toBe(false);
    expect(before.included).toBe(50);
    expect(before.used).toBe(0);
    expect(before.remaining).toBe(50);

    await recordUsage({ model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, feature: "draft" });
    await recordUsage({ model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, feature: "reply" });

    const after = await usageMeter();
    expect(after.used).toBe(2);
    expect(after.remaining).toBe(48);
    expect(after.limit).toBe(50);
    expect(after.fraction).toBeCloseTo(2 / 50);
  });

  it("is within allowance under the limit", async () => {
    expect(await isWithinActionAllowance()).toBe(true);
  });
});

describe("top-up packs", () => {
  it("expose action amounts for purchase", () => {
    expect(TOPUP_PACKS.length).toBeGreaterThanOrEqual(3);
    expect(getTopupPack("5k")?.actions).toBe(5000);
    expect(getTopupPack("nope")).toBeUndefined();
    for (const p of TOPUP_PACKS) {
      expect(p.actions).toBeGreaterThan(0);
      expect(p.suggestedUsd).toBeGreaterThan(0);
    }
  });
});
