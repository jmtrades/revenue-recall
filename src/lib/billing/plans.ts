/**
 * Plan catalog. Pure data so it's safe to import on client and server. Stripe
 * price ids are resolved separately (server-only) from env, so a plan is
 * purchasable only once you've wired its price.
 */

export type PlanId = "free" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** Display price, e.g. "$0" or "$49". */
  price: string;
  cadence: string;
  features: string[];
  /** Self-serve checkout is possible (a real price can be attached). */
  purchasable: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    blurb: "See the revenue you're already losing.",
    price: "$0",
    cadence: "/mo",
    features: ["Built-in CRM — or connect your own", "Revenue Recall engine: slipping deals ranked by $", "Outreach in your voice", "1 seat · 1 pipeline"],
    purchasable: false,
  },
  {
    id: "growth",
    name: "Operator",
    blurb: "An autonomous sales rep on every desk.",
    price: "$99",
    cadence: "/user/mo",
    features: ["Everything in Starter", "Autonomous outbound: email, SMS & phone", "Autopilot sequences that work the pipeline", "AI call prep + auto-logged outcomes", "Connect any CRM", "Unlimited pipelines · up to 25 seats"],
    purchasable: true,
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "We run your entire outbound operation.",
    price: "Let's talk",
    cadence: "",
    features: ["Everything in Operator", "Hands-off autonomy at volume", "Multi-team · unlimited seats", "SSO & RBAC · security review", "Dedicated success + done-for-you playbooks"],
    purchasable: false,
  },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "growth" || v === "scale";
}
