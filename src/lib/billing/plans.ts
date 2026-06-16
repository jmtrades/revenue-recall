/**
 * Plan catalog. Pure data so it's safe to import on client and server. Stripe
 * price ids are resolved separately (server-only) from env, so a plan is
 * purchasable only once you've wired its price.
 *
 * Pricing is per autonomous AI rep, not per human seat — the product replaces
 * SDR labor, so it's priced against that, with a bounded monthly AI-action
 * allowance that protects gross margin (AI inference is the main COGS).
 */

export type PlanId = "free" | "growth" | "team" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** Display price, e.g. "$0" or "$149". */
  price: string;
  cadence: string;
  features: string[];
  /** Self-serve checkout is possible (a real price can be attached). */
  purchasable: boolean;
  /** Billed per autonomous rep — Stripe quantity = seats. Flat plans bill once
   *  (quantity 1) regardless of team size, so they're never multiplied by seats. */
  perSeat: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    blurb: "See the revenue you're already losing.",
    price: "$0",
    cadence: "/mo",
    features: ["Built-in CRM — or connect your own", "Revenue Recall engine: slipping deals ranked by $", "Outreach in your voice (template AI)", "1 seat · 1 pipeline"],
    purchasable: false,
    perSeat: false,
  },
  {
    id: "growth",
    name: "Operator",
    blurb: "One tireless AI salesperson, working around the clock for you.",
    price: "$599",
    cadence: "/rep/mo",
    features: ["Everything in Starter", "Calls, emails & texts your leads for you — in a warm, human voice", "Plenty to personally reach around 100 leads every single day", "Writes every message in your voice — you just tap approve", "Works your whole pipeline automatically, even while you sleep", "Books meetings and logs everything straight to your CRM", "Works with your CRM, or use ours", "Get your own working phone number, right in the app"],
    purchasable: true,
    perSeat: true,
  },
  {
    id: "team",
    name: "Autopilot",
    blurb: "A whole sales team on autopilot — for a fraction of one new hire.",
    price: "$1,699",
    cadence: "/mo",
    features: ["Everything in Operator", "A full sales team on autopilot — covers up to 5 people", "Plenty of calling and messaging to work thousands of leads a month", "Every lead worked, every follow-up made — nothing ever slips", "Shows you exactly how much revenue it won back", "Priority support", "Your own phone numbers & advanced automations"],
    purchasable: true,
    perSeat: false,
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "We run your entire outbound operation.",
    price: "Let's talk",
    cadence: "",
    features: ["Everything in Autopilot", "Unlimited reps & volume", "Role-based access control · security review · SLA", "Dedicated success + done-for-you playbooks", "Custom model routing & integrations"],
    purchasable: false,
    perSeat: false,
  },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "growth" || v === "team" || v === "scale";
}

// The marketing names (Operator/Autopilot) differ from the internal billing keys
// (growth/team) for back-compat. Accept BOTH from a ?plan= URL so the public
// links can read cleanly (?plan=operator) without renaming the billing internals
// or breaking existing ?plan=growth links. Returns the canonical PlanId.
const PLAN_ALIASES: Record<string, PlanId> = {
  free: "free",
  starter: "free",
  growth: "growth",
  operator: "growth",
  team: "team",
  autopilot: "team",
  scale: "scale",
};
export function normalizePlanParam(raw?: string | null): PlanId | undefined {
  if (!raw) return undefined;
  return PLAN_ALIASES[raw.trim().toLowerCase()];
}
