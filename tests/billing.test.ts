import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyStripeSignature, planForPrice } from "@/lib/billing/stripe";
import { PLANS, getPlan, isPlanId } from "@/lib/billing/plans";

function sign(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("stripe webhook signature", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a correctly signed, fresh payload", () => {
    expect(verifyStripeSignature(payload, sign(payload, secret), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(payload, secret);
    expect(verifyStripeSignature(payload + "x", header, secret)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyStripeSignature(payload, sign(payload, secret), "whsec_other")).toBe(false);
  });

  it("rejects a stale timestamp beyond tolerance", () => {
    const old = Math.floor(Date.now() / 1000) - 10_000;
    expect(verifyStripeSignature(payload, sign(payload, secret, old), secret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
    expect(verifyStripeSignature(payload, "garbage", secret)).toBe(false);
  });
});

describe("plan catalog", () => {
  it("has exactly the three known plans, free first", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "growth", "scale"]);
    expect(PLANS[0].purchasable).toBe(false); // free isn't a checkout
    expect(getPlan("growth").purchasable).toBe(true);
  });

  it("getPlan falls back to free for an unknown id", () => {
    // @ts-expect-error intentionally invalid
    expect(getPlan("enterprise").id).toBe("free");
  });

  it("isPlanId guards inputs", () => {
    expect(isPlanId("growth")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(isPlanId(5)).toBe(false);
  });

  it("planForPrice returns undefined when no prices are configured", () => {
    expect(planForPrice(undefined)).toBeUndefined();
    expect(planForPrice("price_xyz")).toBeUndefined();
  });
});
