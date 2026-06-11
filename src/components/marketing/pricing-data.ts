/**
 * The marketing price list — ONE source for both the rendered plan cards
 * (PricingPlans, a client component) and the /pricing page's structured-data
 * offers (a server component). Lives in a non-"use client" module so the
 * server can read the actual array, not a client reference.
 */

export interface Plan {
  name: string;
  /** Monthly price in USD, or null for custom/contact. 0 = free. */
  monthly: number | null;
  unit: string;
  tagline: string;
  cta: string;
  href: string;
  featured: boolean;
  /** One-line value anchor shown under the price. */
  anchor: string;
  features: string[];
  customLabel?: string;
}

// Annual billing gives ~2 months free (≈17% off).
const ANNUAL_FACTOR = 10 / 12;
export function annualMonthly(monthly: number): number {
  return Math.round(monthly * ANNUAL_FACTOR);
}

// Enterprise leads go straight to a human — a "demo" CTA that lands on a signup
// form is a broken promise that costs exactly the deals worth the most.
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@recall-touch.com";
const SALES_HREF = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Scale plan — running our outbound on Revenue Recall")}`;

export const PLANS: Plan[] = [
  {
    name: "Starter",
    monthly: 0,
    unit: "/mo",
    tagline: "See the revenue you're losing.",
    cta: "Start free",
    href: "/signup",
    featured: false,
    anchor: "Free forever · no card",
    features: [
      "Built-in CRM — or connect your own",
      "Revenue Recall engine: deals ranked by $ recoverable",
      "Outreach in your voice (template AI)",
      "Unlimited practice calls — on-device AI voice, free forever",
      "1 seat · 1 pipeline",
    ],
  },
  {
    name: "Operator",
    monthly: 399,
    unit: "/rep/mo",
    tagline: "One autonomous AI rep, working 24/7.",
    cta: "Get started",
    href: "/signup?plan=growth",
    featured: false,
    anchor: "An SDR costs $5,000+/mo for 8 hrs a day. This is one rep that never clocks out.",
    features: [
      "Everything in Starter",
      "Live AI across email, SMS & the phone",
      "~100 dials a day — 1,500 talk minutes/mo in a premium human voice",
      "No-answers are free · per-second billing · voicemail drops ~30s",
      "Autopilot sequences — it works the pipeline",
      "~1,500 AI messages / mo (emails, texts & calls it writes)",
      "Connect any CRM · unlimited pipelines",
    ],
  },
  {
    name: "Autopilot",
    monthly: 899,
    unit: "/mo",
    tagline: "An autonomous sales team for the whole desk.",
    cta: "Get started",
    href: "/signup?plan=team",
    featured: true,
    anchor: "Replaces an SDR pod + your sequencer + your dialer — for less than one hire.",
    features: [
      "Everything in Operator",
      "Up to 5 reps · ~10,000 AI messages / mo pooled",
      "~6,000 dials a month — 4,000 talk minutes pooled across the desk",
      "Batch engine — more volume, lower cost",
      "Recovered-revenue reporting & team analytics",
      "Priority queue + advanced automations",
    ],
  },
  {
    name: "Scale",
    monthly: null,
    customLabel: "Let's talk",
    unit: "",
    tagline: "We run your entire outbound operation.",
    cta: "Talk to sales",
    href: SALES_HREF,
    featured: false,
    anchor: "Replace a whole SDR team — at a fraction of the headcount cost.",
    features: [
      "Everything in Autopilot",
      "Unlimited reps, volume & call minutes",
      "SSO & RBAC · security review · SLA",
      "Dedicated success + done-for-you playbooks",
      "Custom model routing & integrations",
    ],
  },
];
