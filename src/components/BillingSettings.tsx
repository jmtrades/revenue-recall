"use client";

import { useState } from "react";
import { PLANS, getPlan, type PlanId } from "@/lib/billing/plans";

interface Props {
  configured: boolean;
  plan: PlanId;
  status: string;
  seats: number;
  currentPeriodEnd?: string;
  hasCustomer: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-success/15 text-success",
  trialing: "bg-brand-soft text-brand",
  past_due: "bg-warn/15 text-warn",
  canceled: "bg-danger/15 text-danger",
  none: "bg-surface-2 text-muted",
};

export function BillingSettings({ configured, plan, status, seats, currentPeriodEnd, hasCustomer }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = getPlan(plan);

  async function go(path: string, body?: unknown) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.url) window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Current plan */}
      <div className="rounded-lg border border-brand/40 bg-brand-soft/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-fg">{current.name} plan</p>
            <p className="text-xs text-muted">{current.blurb}</p>
          </div>
          <span className={`pill ${STATUS_STYLE[status] ?? STATUS_STYLE.none}`}>{status === "none" ? "Free" : status}</span>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm">
            <span className="text-muted">Seats</span>
            <span className="text-fg">{seats} active</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm">
            <span className="text-muted">Billing cycle</span>
            <span className="text-fg">Monthly</span>
          </div>
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted">{status === "canceled" ? "Access until" : "Renews"}</span>
            <span className="text-fg">{currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : "—"}</span>
          </div>
        </div>
        {hasCustomer && (
          <button
            onClick={() => go("/api/billing/portal")}
            disabled={busy !== null}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-fg transition hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "/api/billing/portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>

      {/* Plans */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          return (
            <div key={p.id} className={`rounded-xl border p-4 ${isCurrent ? "border-brand bg-surface-2" : "border-border bg-surface"}`}>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-fg">{p.name}</p>
                <p className="text-sm text-fg">{p.price}<span className="text-xs text-muted">{p.cadence}</span></p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-muted">
                    <span className="mt-0.5 text-success">✓</span> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {isCurrent ? (
                  <span className="block rounded-lg bg-surface-2 px-3 py-1.5 text-center text-xs text-muted">Current plan</span>
                ) : p.purchasable ? (
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: p.id, seats })}
                    disabled={!configured || busy !== null}
                    className="block w-full rounded-lg bg-brand px-3 py-1.5 text-center text-xs font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
                  >
                    {busy === "/api/billing/checkout" ? "Starting…" : `Upgrade to ${p.name}`}
                  </button>
                ) : (
                  <a href="/security" className="block rounded-lg border border-border px-3 py-1.5 text-center text-xs text-fg transition hover:bg-surface-2">
                    {p.id === "scale" ? "Talk to us" : "Included"}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!configured && (
        <p className="text-xs text-muted">
          Self-serve checkout is inactive until Stripe is connected. Set <code className="text-fg">STRIPE_SECRET_KEY</code>,{" "}
          <code className="text-fg">STRIPE_PRICE_GROWTH</code>, and <code className="text-fg">STRIPE_WEBHOOK_SECRET</code> to enable real billing.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
