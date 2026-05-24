/**
 * Single source of truth for pricing, plan quotas, and unit-economics.
 *
 * Margins are protected by three things working together:
 *  1. Haiku-default model + cached system prompts keep per-action cost low.
 *  2. Included AI-action pools are sized so that even a user maxing them out
 *     on the cheaper annual price still leaves >= 90% gross margin.
 *  3. Usage beyond the pool requires credits, which are themselves priced at
 *     ~90% margin — so cost can never outrun revenue.
 *
 * If you change a price or quota, `assertMargins()` (run in tests / dev) will
 * fail unless every paid plan still clears the floor at max included usage.
 */

export type PlanId = "starter" | "growth" | "scale" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly per-seat price (USD). null = custom / contact sales. */
  monthly: number | null;
  /** Per-seat price when billed annually (per month). null = custom. */
  annual: number | null;
  /** AI actions included per seat per month. */
  includedActions: number;
  /** Stripe Price ID env var names (set in Vercel; inert until present). */
  stripePriceEnv?: { monthly: string; annual: string };
}

/** Conservative cost model. Tune COST_PER_ACTION as real usage data lands. */
export const COST_PER_ACTION = 0.005; // Haiku 4.5 + cached system prompt
export const INFRA_PER_SEAT = 1.0; // hosting + DB, amortized per seat / mo
export const STRIPE_PCT = 0.029;
export const STRIPE_FIXED = 0.3;
export const MARGIN_FLOOR = 0.9;

/** What we charge per overage AI action (credits). ~90% margin at COST. */
export const CREDIT_PRICE_PER_ACTION = 0.05;
export const CREDIT_PACKS = [
  { actions: 500, price: 25 },
  { actions: 2000, price: 100 },
  { actions: 5000, price: 250 },
];

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", monthly: 0, annual: 0, includedActions: 50 },
  growth: {
    id: "growth",
    name: "Growth",
    monthly: 99,
    annual: 79,
    includedActions: 800,
    stripePriceEnv: { monthly: "STRIPE_PRICE_GROWTH_MONTHLY", annual: "STRIPE_PRICE_GROWTH_ANNUAL" },
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthly: 199,
    annual: 159,
    includedActions: 2000,
    stripePriceEnv: { monthly: "STRIPE_PRICE_SCALE_MONTHLY", annual: "STRIPE_PRICE_SCALE_ANNUAL" },
  },
  enterprise: { id: "enterprise", name: "Enterprise", monthly: null, annual: null, includedActions: 10000 },
};

export function getPlan(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "starter"] ?? PLANS.starter;
}

/**
 * Worst-case gross margin for a plan at full included-quota usage, for a
 * given billing cycle. Annual amortizes the (smaller, once-a-year) Stripe fee.
 */
export function grossMarginAtMax(plan: Plan, cycle: "monthly" | "annual"): number | null {
  const price = cycle === "monthly" ? plan.monthly : plan.annual;
  if (!price) return null; // free or custom — not a margin constraint here
  if (price === 0) return null;

  const aiCost = plan.includedActions * COST_PER_ACTION;
  const stripe =
    cycle === "monthly"
      ? price * STRIPE_PCT + STRIPE_FIXED
      : (price * 12 * STRIPE_PCT + STRIPE_FIXED) / 12; // annual fee spread per month
  const cogs = aiCost + INFRA_PER_SEAT + stripe;
  return (price - cogs) / price;
}

/** Throws if any paid plan would dip below the margin floor at max usage. */
export function assertMargins(): void {
  for (const plan of Object.values(PLANS)) {
    for (const cycle of ["monthly", "annual"] as const) {
      const m = grossMarginAtMax(plan, cycle);
      if (m !== null && m < MARGIN_FLOOR) {
        throw new Error(
          `Plan ${plan.id} (${cycle}) gross margin ${(m * 100).toFixed(1)}% < floor ${(MARGIN_FLOOR * 100).toFixed(0)}%`,
        );
      }
    }
  }
}
