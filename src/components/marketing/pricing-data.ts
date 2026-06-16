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
    tagline: "One tireless salesperson, working your whole list 24/7.",
    cta: "Get started",
    href: "/signup?plan=operator",
    featured: false,
    anchor: "A salesperson costs $5,000+ a month for eight hours a day. This one never clocks out — and winning back a single deal usually pays for the entire year.",
    features: [
      "Everything in Starter",
      "Calls, emails & texts your leads for you — in a warm, human voice",
      "Works through your entire list — reaching out to hundreds of leads a week",
      "Books the meeting and shows up on time — “call me at 3” and it calls at 3",
      "Writes and sends every message in your voice — you just tap approve",
      "Chases every single follow-up, so deals stop slipping through the cracks",
      "Calls only at the right times, and backs off the moment someone says no",
      "Up and running with your CRM in minutes — or use ours",
    ],
  },
  {
    name: "Autopilot",
    monthly: 1699,
    unit: "/mo",
    tagline: "An entire sales team on autopilot, working every lead you have.",
    cta: "Get started",
    href: "/signup?plan=autopilot",
    featured: true,
    anchor: "Replaces an entire outreach team — the dialing, the follow-ups, the chasing — for less than one new hire. A few won-back deals and it's paid for itself many times over.",
    features: [
      "Everything in Operator",
      "A full outreach team on autopilot — covers up to 5 people",
      "Enough firepower to work your entire database, month after month",
      "Every lead called, every follow-up sent — nothing ever slips",
      "Books meetings straight onto your calendar, day and night",
      "Shows you the exact revenue it brought back",
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
