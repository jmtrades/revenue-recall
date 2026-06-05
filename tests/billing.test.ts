import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { verifyStripeSignature, planForPrice, priceId } from "@/lib/billing/stripe";
import { PLANS, getPlan, isPlanId, type PlanId } from "@/lib/billing/plans";

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

  it("accepts when one of several v1 signatures matches (endpoint-secret rotation)", () => {
    const t = Math.floor(Date.now() / 1000);
    const good = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
    const bad = crypto.createHmac("sha256", "whsec_old").update(`${t}.${payload}`, "utf8").digest("hex");
    // Stripe sends a v1 per active secret during rotation, in either order.
    expect(verifyStripeSignature(payload, `t=${t},v1=${bad},v1=${good}`, secret)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t},v1=${good},v1=${bad}`, secret)).toBe(true);
    // ...but still rejects when NONE of the v1s match.
    expect(verifyStripeSignature(payload, `t=${t},v1=${bad},v1=${bad}`, secret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
    expect(verifyStripeSignature(payload, "garbage", secret)).toBe(false);
  });
});

describe("plan catalog", () => {
  it("has the known plan tiers in order, free first", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "growth", "team", "scale"]);
    expect(PLANS[0].purchasable).toBe(false); // free isn't a checkout
    expect(getPlan("growth").purchasable).toBe(true);
    expect(getPlan("team").purchasable).toBe(true); // new self-serve team tier
    expect(getPlan("scale").purchasable).toBe(false); // contact sales
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

describe("billing cycle (monthly/annual) price resolution", () => {
  const ENV_KEYS = ["STRIPE_PRICE_GROWTH", "STRIPE_PRICE_GROWTH_ANNUAL"] as const;
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("resolves the monthly price by default", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_growth_m";
    expect(priceId("growth")).toBe("price_growth_m");
    expect(priceId("growth", "monthly")).toBe("price_growth_m");
  });

  it("resolves the annual price when wired", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_growth_m";
    process.env.STRIPE_PRICE_GROWTH_ANNUAL = "price_growth_y";
    expect(priceId("growth", "annual")).toBe("price_growth_y");
  });

  it("falls back to monthly for annual when no annual price exists (no dead end)", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_growth_m";
    expect(priceId("growth", "annual")).toBe("price_growth_m");
  });

  it("reverses both monthly and annual price ids back to the plan", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_growth_m";
    process.env.STRIPE_PRICE_GROWTH_ANNUAL = "price_growth_y";
    expect(planForPrice("price_growth_m")).toBe("growth");
    expect(planForPrice("price_growth_y")).toBe("growth");
  });

  it("free has no price in any cycle", () => {
    expect(priceId("free")).toBeUndefined();
    expect(priceId("free", "annual")).toBeUndefined();
  });
});

describe("subscriptions schema matches the plan catalog", () => {
  // Guards the launch-blocking drift where the DB CHECK constraint omitted a
  // plan the app sells (e.g. 'team'), so that plan's Stripe webhook write failed
  // and the paying customer never activated. The effective constraint is the
  // latest migration that defines it; assert it admits every PlanId in code.
  function effectivePlanConstraint(): string {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let constraint = "";
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      // Capture the most recent "plan in (...)" clause across all migrations.
      const matches = [...sql.matchAll(/plan\s+in\s*\(([^)]*)\)/gi)];
      if (matches.length) constraint = matches[matches.length - 1][1];
    }
    return constraint;
  }

  it("admits every plan id the code can persist", () => {
    const allowed = effectivePlanConstraint();
    expect(allowed).not.toBe("");
    for (const id of PLANS.map((p) => p.id) as PlanId[]) {
      expect(allowed).toContain(`'${id}'`);
    }
  });
});
