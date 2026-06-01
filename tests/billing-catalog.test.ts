import { describe, it, expect, beforeEach } from "vitest";
import { resolvePriceId, resolveTopupPriceId } from "@/lib/billing/stripe";
import { CATALOG, catalogForPlan, catalogForTopup } from "@/lib/billing/catalog";

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("STRIPE_")) delete process.env[k];
});

describe("billing catalog", () => {
  it("matches the public prices and covers monthly + annual + every top-up", () => {
    expect(catalogForPlan("growth", "monthly")?.unitAmountCents).toBe(29_900); // $299
    expect(catalogForPlan("team", "monthly")?.unitAmountCents).toBe(89_900); // $899
    expect(catalogForPlan("growth", "annual")?.unitAmountCents).toBe(299_000); // 10x
    expect(catalogForPlan("team", "annual")?.unitAmountCents).toBe(899_000);
    expect(catalogForTopup("5k")?.unitAmountCents).toBe(9_900); // $99
  });
  it("uses unique lookup keys (idempotent provisioning)", () => {
    const keys = CATALOG.map((c) => c.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("price resolution (env override vs auto-provisioned)", () => {
  it("prefers an explicit env price id when set", async () => {
    process.env.STRIPE_PRICE_GROWTH = "price_env_123";
    expect(await resolvePriceId("growth", "monthly")).toBe("price_env_123");
  });
  it("returns undefined when neither env nor Stripe is configured", async () => {
    expect(await resolvePriceId("growth", "monthly")).toBeUndefined();
    expect(await resolveTopupPriceId("5k")).toBeUndefined();
  });
});
