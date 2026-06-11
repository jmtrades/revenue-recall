import type { PlanId } from "@/lib/billing/plans";
import { TOPUP_PACKS } from "@/lib/billing/topups";

/**
 * The canonical billing catalog — the single source of truth for what gets
 * created in Stripe by the auto-setup. Each entry carries a stable `lookupKey`
 * so provisioning is idempotent (re-running reuses the same price) and so prices
 * can be resolved at runtime by key without anyone pasting price ids.
 *
 * Prices mirror the public pricing exactly: Operator $399/mo (per rep),
 * Autopilot $899/mo (flat), annual = 10x monthly (~2 months free), and the
 * one-time top-up packs. Amounts are in cents.
 *
 * Changing an amount here reprices on the next /api/billing/setup run:
 * provisioning detects the drift and mints a NEW Stripe price, transferring
 * the lookup key — existing subscribers keep their old price (grandfathered),
 * new checkouts get the new one.
 */
export interface CatalogPrice {
  lookupKey: string;
  /** Stable product grouping (one product can hold monthly + annual prices). */
  productKey: string;
  productName: string;
  description: string;
  unitAmountCents: number;
  currency: string;
  recurring?: { interval: "month" | "year" };
  /** Operator env override; if set, it wins over the auto-resolved id. */
  envVar: string;
  kind: "plan" | "topup";
  plan?: Exclude<PlanId, "free">;
  cycle?: "monthly" | "annual";
  packId?: string;
}

const USD = "usd";

export const CATALOG: CatalogPrice[] = [
  { lookupKey: "rr_operator_monthly", productKey: "rr_operator", productName: "Operator", description: "One autonomous AI rep — per rep / month", unitAmountCents: 39_900, currency: USD, recurring: { interval: "month" }, envVar: "STRIPE_PRICE_GROWTH", kind: "plan", plan: "growth", cycle: "monthly" },
  { lookupKey: "rr_operator_annual", productKey: "rr_operator", productName: "Operator", description: "Operator — per rep / year (2 months free)", unitAmountCents: 399_000, currency: USD, recurring: { interval: "year" }, envVar: "STRIPE_PRICE_GROWTH_ANNUAL", kind: "plan", plan: "growth", cycle: "annual" },
  { lookupKey: "rr_autopilot_monthly", productKey: "rr_autopilot", productName: "Autopilot", description: "Autonomous sales team — up to 5 reps / month", unitAmountCents: 89_900, currency: USD, recurring: { interval: "month" }, envVar: "STRIPE_PRICE_TEAM", kind: "plan", plan: "team", cycle: "monthly" },
  { lookupKey: "rr_autopilot_annual", productKey: "rr_autopilot", productName: "Autopilot", description: "Autopilot — per year (2 months free)", unitAmountCents: 899_000, currency: USD, recurring: { interval: "year" }, envVar: "STRIPE_PRICE_TEAM_ANNUAL", kind: "plan", plan: "team", cycle: "annual" },
  ...TOPUP_PACKS.map((p): CatalogPrice => ({
    lookupKey: `rr_topup_${p.id}`,
    productKey: `rr_topup_${p.id}`,
    productName: `${p.label} top-up`,
    description: p.unit === "minutes" ? `${p.actions.toLocaleString()} extra AI talk minutes (one-time)` : `${p.actions.toLocaleString()} extra AI messages (one-time)`,
    unitAmountCents: Math.round(p.suggestedUsd * 100),
    currency: USD,
    envVar: p.priceEnv,
    kind: "topup",
    packId: p.id,
  })),
];

export function catalogForPlan(plan: Exclude<PlanId, "free">, cycle: "monthly" | "annual"): CatalogPrice | undefined {
  return CATALOG.find((c) => c.kind === "plan" && c.plan === plan && c.cycle === cycle);
}

export function catalogForTopup(packId: string): CatalogPrice | undefined {
  return CATALOG.find((c) => c.kind === "topup" && c.packId === packId);
}
