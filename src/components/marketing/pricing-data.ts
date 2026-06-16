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
    anchor: "Free forever · no card needed",
    features: [
      "Your own CRM, ready to go — or bring the one you have",
      "Instantly shows which old leads are worth the most to win back",
      "Drafts outreach that sounds like you",
      "Practice live calls as much as you want — always free",
      "Perfect for one person getting started",
    ],
  },
  {
    name: "Operator",
    monthly: 599,
    unit: "/rep/mo",
    tagline: "One autonomous AI rep, working 24/7.",
    cta: "Get started",
    href: "/signup?plan=operator",
    featured: false,
    anchor: "A salesperson costs $5,000+ a month for eight hours a day. This one works around the clock — for about a tenth of the cost.",
    features: [
      "Everything in Starter",
      "Calls, emails & texts your leads for you — in a warm, human voice",
      "Plenty to personally reach around 100 leads, every single day",
      "Books the meeting and shows up on time — “call me at 3” and it calls at 3",
      "Writes every message in your voice — you just tap approve",
      "Never forgets a follow-up, and never calls at a bad time",
      "Works with your CRM, or use ours — set up in minutes",
    ],
  },
  {
    name: "Autopilot",
    monthly: 1699,
    unit: "/mo",
    tagline: "An autonomous sales team for the whole desk.",
    cta: "Get started",
    href: "/signup?plan=autopilot",
    featured: true,
    anchor: "Replaces a whole outreach team — the dialing, the follow-ups, the chasing — for less than one new hire.",
    features: [
      "Everything in Operator",
      "A full sales team on autopilot — covers up to 5 people",
      "Plenty of calling and messaging to work thousands of leads a month",
      "Every lead worked, every follow-up made — nothing ever slips",
      "Shows you exactly how much revenue it won back",
      "Priority support, your own phone numbers & advanced automations",
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
      "No limits — unlimited people, calling and messaging",
      "Enterprise security, single sign-on & a dedicated agreement",
      "A dedicated expert who sets everything up for you",
      "Custom integrations with whatever you already use",
    ],
  },
];
