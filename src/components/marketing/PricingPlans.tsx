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
    features: ["Built-in CRM", "Revenue Recall queue", "AI drafting (templates)", "1 pipeline"],
    featured: false,
  },
  {
    name: "Growth",
    monthly: 49,
    annual: 39,
    unit: "/user/mo",
    blurb: "For teams recovering serious revenue.",
    cta: "Start free trial",
    href: "/signup",
    features: [
      "Everything in Starter",
      "Connect any CRM",
      "Live AI drafting + briefs",
      "Power Dialer + email/SMS",
      "Automations",
      "Unlimited pipelines",
    ],
    featured: true,
  },
  {
    name: "Scale",
    monthly: null,
    annual: null,
    unit: "",
    blurb: "For multi-team orgs and brokerages.",
    cta: "Talk to us",
    href: "/signup",
    features: ["Everything in Growth", "SSO & RBAC", "Dedicated success", "Custom integrations", "Security review"],
    featured: false,
  },
];

export function PricingPlans() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Pricing</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Start free. Scale when it pays for itself.
        </h2>
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

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCustom = p.monthly === null;
          const price = isCustom ? "Custom" : `$${annual ? p.annual : p.monthly}`;
          return (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-7 ${p.featured ? "border-brand bg-surface ring-glow" : "border-border bg-surface"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-semibold text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-semibold text-white">{price}</span>
                <span className="mb-1 text-sm text-muted">{p.unit}</span>
              </div>
              <p className="mt-1 h-4 text-xs text-muted">
                {!isCustom && p.monthly! > 0 && annual ? "billed annually" : " "}
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
    </section>
  );
}
