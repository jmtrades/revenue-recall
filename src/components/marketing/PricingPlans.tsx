"use client";

import { useState } from "react";
import Link from "next/link";

type Cycle = "monthly" | "annual";

interface Plan {
  name: string;
  /** Monthly price in USD, or null for custom/contact. 0 = free. */
  monthly: number | null;
  perSeat: boolean;
  tagline: string;
  cta: string;
  href: string;
  featured: boolean;
  /** A one-line value anchor shown under the price. */
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
    perSeat: false,
    tagline: "See the revenue you're already losing.",
    cta: "Start free",
    href: "/signup",
    featured: false,
    anchor: "Free forever · no card",
    features: [
      "Built-in CRM — or connect your own",
      "Revenue Recall engine: every slipping deal, ranked by $ recoverable",
      "Outreach written in your voice",
      "1 seat · 1 pipeline",
    ],
  },
  {
    name: "Operator",
    monthly: 99,
    perSeat: true,
    tagline: "An autonomous sales rep on every desk.",
    cta: "Start free trial",
    href: "/signup",
    featured: true,
    anchor: "An SDR costs $5,000+/mo and works 8 hrs a day. Operator works 24/7.",
    features: [
      "Everything in Starter",
      "Autonomous outbound across email, SMS & the phone",
      "Autopilot sequences — it works the pipeline so you don't",
      "AI call prep, live talk-tracks & auto-logged outcomes",
      "Connect any CRM — HubSpot, Salesforce, Close, Pipedrive",
      "Unlimited pipelines · up to 25 seats",
    ],
  },
  {
    name: "Scale",
    monthly: null,
    customLabel: "Let's talk",
    perSeat: false,
    tagline: "We run your entire outbound operation.",
    cta: "Book a demo",
    href: "/signup",
    featured: false,
    anchor: "Replace a whole SDR team — at a fraction of the cost.",
    features: [
      "Everything in Operator",
      "Fully hands-off autonomy at volume (batch drafting engine)",
      "Multi-team & unlimited seats",
      "SSO & RBAC · security review",
      "Dedicated success + done-for-you playbooks",
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

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCustom = p.monthly === null;
          const isFree = p.monthly === 0;
          const shown = isCustom || isFree ? null : cycle === "annual" ? annualMonthly(p.monthly as number) : (p.monthly as number);
          const priceLabel = isCustom ? (p.customLabel ?? "Custom") : isFree ? "$0" : `$${shown}`;
          const cadence = isCustom ? "" : isFree ? "/mo" : p.perSeat ? "/user/mo" : "/mo";
          return (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border p-7 ${p.featured ? "border-brand bg-surface ring-glow lg:-mt-4 lg:pb-10" : "border-border bg-surface"}`}
            >
              {p.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="text-lg font-semibold text-fg">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-semibold text-fg">{priceLabel}</span>
                {cadence && <span className="mb-1 text-sm text-muted">{cadence}</span>}
              </div>
              <p className="mt-1 h-4 text-xs text-success">
                {cycle === "annual" && !isCustom && !isFree ? `Billed annually — save $${((p.monthly as number) - (shown as number)) * 12}/user/yr` : ""}
              </p>
              <Link
                href={p.href}
                className={`mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${p.featured ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-fg hover:bg-surface-2"}`}
              >
                {p.cta}
              </Link>
              <p className="mt-3 text-xs leading-relaxed text-muted">{p.anchor}</p>
              <ul className="mt-6 space-y-2.5 border-t border-border/60 pt-6">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <span className="mt-0.5 text-success">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-center text-sm text-muted">Every plan starts free. No card to begin. Cancel anytime.</p>
    </div>
  );
}
