"use client";

import { useState } from "react";
import Link from "next/link";

type Cycle = "monthly" | "annual";

interface Plan {
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

const PLANS: Plan[] = [
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
      "1 seat · 1 pipeline",
    ],
  },
  {
    name: "Operator",
    monthly: 149,
    unit: "/rep/mo",
    tagline: "One autonomous AI rep, working 24/7.",
    cta: "Start free trial",
    href: "/signup",
    featured: false,
    anchor: "An SDR costs $5,000+/mo for 8 hrs a day. This is one rep that never clocks out.",
    features: [
      "Everything in Starter",
      "Live AI across email, SMS & the phone",
      "Autopilot sequences — it works the pipeline",
      "~1,500 AI actions / mo included",
      "Connect any CRM · unlimited pipelines",
    ],
  },
  {
    name: "Autopilot",
    monthly: 549,
    unit: "/mo",
    tagline: "An autonomous sales team for the whole desk.",
    cta: "Start free trial",
    href: "/signup",
    featured: true,
    anchor: "Replaces an SDR pod + your sequencer + your dialer — for less than one hire.",
    features: [
      "Everything in Operator",
      "Up to 5 reps · ~10,000 AI actions / mo pooled",
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
    cta: "Book a demo",
    href: "/signup",
    featured: false,
    anchor: "Replace a whole SDR team — at a fraction of the headcount cost.",
    features: [
      "Everything in Autopilot",
      "Unlimited reps & volume",
      "SSO & RBAC · security review · SLA",
      "Dedicated success + done-for-you playbooks",
      "Custom model routing & integrations",
    ],
  },
];

export function PricingPlans() {
  const [cycle, setCycle] = useState<Cycle>("annual");

  return (
    <div>
      <div className="mt-8 flex items-center justify-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1 text-sm">
          {(["monthly", "annual"] as Cycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`rounded-lg px-4 py-1.5 font-medium capitalize transition ${cycle === c ? "bg-brand text-white" : "text-muted hover:text-fg"}`}
              aria-pressed={cycle === c}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">2 months free</span>
      </div>

      <div className="mt-12 grid items-start gap-5 lg:grid-cols-4">
        {PLANS.map((p) => {
          const isCustom = p.monthly === null;
          const isFree = p.monthly === 0;
          const shown = isCustom || isFree ? null : cycle === "annual" ? annualMonthly(p.monthly as number) : (p.monthly as number);
          const priceLabel = isCustom ? (p.customLabel ?? "Custom") : isFree ? "$0" : `$${shown}`;
          return (
            <div
              key={p.name}
              className={`raised relative flex flex-col rounded-2xl border p-6 ${p.featured ? "border-brand bg-surface ring-glow lg:-mt-3 lg:pb-9" : "border-border bg-surface"}`}
            >
              {p.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-[0_4px_12px_-4px_rgb(0_0_0/0.6)]">Most popular</span>}
              <h3 className="text-lg font-semibold text-fg">{p.name}</h3>
              <p className="mt-1 text-sm leading-snug text-muted">{p.tagline}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="font-display text-[2.1rem] font-semibold tabular-nums tracking-tight text-fg">{priceLabel}</span>
                {p.unit && <span className="mb-1 text-sm text-muted">{p.unit}</span>}
              </div>
              <p className="mt-1 h-4 text-xs text-success">
                {cycle === "annual" && !isCustom && !isFree ? `Save $${((p.monthly as number) - (shown as number)) * 12}/yr` : ""}
              </p>
              <Link
                href={p.href}
                className={`cta mt-5 block rounded-full px-4 py-2.5 text-center text-sm font-semibold ${p.featured ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-fg hover:bg-surface-2"}`}
              >
                {p.cta}
              </Link>
              <p className="mt-3 text-xs leading-relaxed text-muted">{p.anchor}</p>
              <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted">
                    <span className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand/15 text-brand">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        Every plan starts free — no card to begin. Need more volume? Top up AI actions anytime. Cancel whenever.
      </p>
    </div>
  );
}
