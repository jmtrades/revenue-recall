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
    blurb: "One autonomous AI rep, working 24/7.",
    price: "$299",
    cadence: "/rep/mo",
    features: ["Everything in Starter", "Live AI across email, SMS & the phone", "Autopilot sequences that work the pipeline", "~1,500 AI messages / mo (emails, texts & calls it writes)", "AI call prep + auto-logged outcomes", "Connect any CRM · unlimited pipelines"],
    purchasable: true,
    perSeat: true,
  },
  {
    id: "team",
    name: "Autopilot",
    blurb: "An autonomous sales team for your whole desk.",
    price: "$899",
    cadence: "/mo",
    features: ["Everything in Operator", "Up to 5 reps · ~10,000 AI messages / mo pooled", "Batch drafting engine (higher volume, lower cost)", "Team analytics + recovered-revenue reporting", "Priority queue & support", "Advanced automations"],
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
