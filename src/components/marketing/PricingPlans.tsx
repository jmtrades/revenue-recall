"use client";

import Link from "next/link";
import { useState } from "react";

type Plan = {
  name: string;
  monthly: number | null; // null = custom pricing
  annual: number | null; // per-user/mo equivalent when billed annually
  unit: string;
  blurb: string;
  cta: string;
  href: string;
  features: string[];
  featured: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    monthly: 0,
    annual: 0,
    unit: "/mo",
    blurb: "For solo closers getting started.",
    cta: "Start free",
    href: "/signup",
    features: ["Built-in CRM", "Revenue Recall queue", "50 AI actions / mo", "1 pipeline", "Community support"],
    featured: false,
  },
  {
    name: "Growth",
    monthly: 99,
    annual: 79,
    unit: "/user/mo",
    blurb: "For teams recovering serious revenue.",
    cta: "Start free trial",
    href: "/signup",
    features: [
      "Everything in Starter",
      "Connect any CRM — or use ours",
      "Live AI drafting + call briefs",
      "Power Dialer + email/SMS",
      "800 AI actions / user / mo",
      "Automations & unlimited pipelines",
    ],
    featured: true,
  },
  {
    name: "Scale",
    monthly: 199,
    annual: 159,
    unit: "/user/mo",
    blurb: "For high-volume sales orgs.",
    cta: "Start free trial",
    href: "/signup",
    features: [
      "Everything in Growth",
      "2,000 AI actions / user / mo",
      "SSO & RBAC",
      "Advanced automations",
      "Priority support",
    ],
    featured: false,
  },
];

export function PricingPlans() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Pricing</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Start free. Scale when it pays for itself.
        </h2>
        <p className="mt-4 text-muted">
          One recovered deal usually covers a year of seats. Comparable sales tools start at $100+/user/mo.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm ${annual ? "text-muted" : "text-white"}`}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Toggle annual billing"
          onClick={() => setAnnual((v) => !v)}
          className={`relative h-6 w-11 rounded-full border transition ${annual ? "border-brand bg-brand/30" : "border-border bg-surface"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-brand transition-all ${annual ? "left-[1.45rem]" : "left-0.5"}`}
          />
        </button>
        <span className={`text-sm ${annual ? "text-white" : "text-muted"}`}>Annual</span>
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Save 20%</span>
      </div>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCustom = p.monthly === null;
          const price = isCustom ? "Custom" : `$${annual ? p.annual : p.monthly}`;
          return (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-7 transition ${p.featured ? "border-brand bg-surface ring-glow lg:-mt-3 lg:pb-10" : "border-border bg-surface hover:border-brand/40"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-semibold text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-semibold text-white">{price}</span>
                <span className="mb-1 text-sm text-muted">{p.unit}</span>
                {!isCustom && p.monthly! > 0 && annual && (
                  <span className="mb-1 text-sm text-muted line-through">${p.monthly}</span>
                )}
              </div>
              <p className="mt-1 h-4 text-xs text-success">
                {!isCustom && p.monthly! > 0 && annual
                  ? `billed annually · save $${(p.monthly! - p.annual!) * 12}/user/yr`
                  : " "}
              </p>
              <Link
                href={p.href}
                className={`mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${p.featured ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-white hover:bg-surface-2"}`}
              >
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

      {/* Enterprise banner */}
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row">
        <div>
          <h3 className="font-semibold text-white">Enterprise</h3>
          <p className="mt-1 text-sm text-muted">
            Unlimited AI, dedicated success, custom integrations, security review, and an SLA for multi-team orgs and brokerages.
          </p>
        </div>
        <Link
          href="/signup"
          className="shrink-0 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-2"
        >
          Talk to sales
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        No credit card to start · Cancel anytime · Your data stays yours
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted/80">
        Calls &amp; SMS are billed as usage credits at near cost. Need more AI actions than your plan includes? Top up with credits anytime.
      </p>
    </section>
  );
}
