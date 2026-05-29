"use client";

import { useState } from "react";
import Link from "next/link";

type Cycle = "monthly" | "annual";

interface Plan {
  name: string;
  /** Monthly price in USD, or null for custom/free-form. 0 = free. */
  monthly: number | null;
  /** Per-seat? affects the cadence label. */
  perSeat: boolean;
  blurb: string;
  cta: string;
  href: string;
  featured: boolean;
  features: string[];
  /** Shown instead of a number when monthly is null (e.g. "Custom"). */
  customLabel?: string;
}

// Annual billing gives ~2 months free (≈17% off), rounded to a clean number.
const ANNUAL_FACTOR = 10 / 12;
/** Effective per-month price when billed annually (2 months free). */
export function annualMonthly(monthly: number): number {
  return Math.round(monthly * ANNUAL_FACTOR);
}

const PLANS: Plan[] = [
  { name: "Starter", monthly: 0, perSeat: false, blurb: "For solo closers getting started.", cta: "Start free", href: "/signup", featured: false, features: ["Built-in CRM", "Revenue Recall queue", "AI drafting (templates)", "1 pipeline"] },
  { name: "Growth", monthly: 49, perSeat: true, blurb: "For teams recovering serious revenue.", cta: "Start free trial", href: "/signup", featured: true, features: ["Everything in Starter", "Connect any CRM", "Live AI drafting + briefs", "Power Dialer + email/SMS", "Automations", "Unlimited pipelines"] },
  { name: "Scale", monthly: null, customLabel: "Custom", perSeat: false, blurb: "For multi-team orgs and brokerages.", cta: "Talk to us", href: "/signup", featured: false, features: ["Everything in Growth", "SSO & RBAC", "Dedicated success", "Custom integrations", "Security review"] },
];

export function PricingPlans() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

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

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCustom = p.monthly === null;
          const isFree = p.monthly === 0;
          const shown = isCustom || isFree ? null : cycle === "annual" ? annualMonthly(p.monthly as number) : (p.monthly as number);
          const priceLabel = isCustom ? (p.customLabel ?? "Custom") : isFree ? "$0" : `$${shown}`;
          const cadence = isCustom ? "" : isFree ? "/mo" : p.perSeat ? "/user/mo" : "/mo";
          return (
            <div key={p.name} className={`relative rounded-2xl border p-7 ${p.featured ? "border-brand bg-surface ring-glow" : "border-border bg-surface"}`}>
              {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="font-semibold text-fg">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-semibold text-fg">{priceLabel}</span>
                {cadence && <span className="mb-1 text-sm text-muted">{cadence}</span>}
              </div>
              <p className="mt-1 h-4 text-xs text-success">
                {cycle === "annual" && !isCustom && !isFree ? `Billed annually — save $${((p.monthly as number) - (shown as number)) * 12}/user/yr` : ""}
              </p>
              <Link href={p.href} className={`mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${p.featured ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-white hover:bg-surface-2"}`}>
                {p.cta}
              </Link>
              <ul className="mt-6 space-y-2.5">
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
    </div>
  );
}
