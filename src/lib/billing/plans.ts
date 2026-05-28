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
    blurb: "For solo closers getting started.",
    price: "$0",
    cadence: "/mo",
    features: ["Built-in CRM", "Revenue Recall queue", "AI drafting (templates)", "1 pipeline"],
    purchasable: false,
  },
  {
    id: "growth",
    name: "Growth",
    blurb: "For teams recovering serious revenue.",
    price: "$49",
    cadence: "/user/mo",
    features: ["Everything in Starter", "Connect any CRM", "Live AI drafting + briefs", "Power Dialer + email/SMS", "Automations", "Unlimited pipelines"],
    purchasable: true,
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "For multi-team orgs and brokerages.",
    price: "Custom",
    cadence: "",
    features: ["Everything in Growth", "SSO & RBAC", "Dedicated success", "Custom integrations", "Security review"],
    purchasable: false,
  },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "growth" || v === "scale";
}
