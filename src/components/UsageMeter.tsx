"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { EmbeddedCheckoutModal, type CheckoutRequest } from "@/components/EmbeddedCheckoutModal";
import { perMessageCents } from "@/lib/billing/topups";

export interface UsageMeterProps {
  /** Already sanitized server-side (no Infinity crosses to the client). */
  meter: { used: number; included: number; credits: number; limit: number; remaining: number; fraction: number; unlimited: boolean };
  topups: { id: string; label: string; actions: number; suggestedUsd: number; blurb: string; featured: boolean; purchasable: boolean }[];
  billingConfigured: boolean;
  planName: string;
}

const fmt = (n: number) => n.toLocaleString();

export function UsageMeter({ meter, topups, billingConfigured, planName }: UsageMeterProps) {
  const [checkout, setCheckout] = useState<CheckoutRequest | null>(null);

  const pct = Math.round(meter.fraction * 100);
  const low = !meter.unlimited && meter.fraction >= 0.8;
  const out = !meter.unlimited && meter.remaining <= 0;
  const barColor = out ? "bg-danger" : low ? "bg-warn" : "bg-brand";

  // Open checkout — embedded on our domain when a publishable key is set, else
  // the modal falls back to hosted Stripe automatically.
  function buy(pack: string) {
    setCheckout({ endpoint: "/api/billing/topup", body: { pack } });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">AI messages this month</p>
        <span className="pill bg-surface-2 text-muted">{planName}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">Each email, text, call script, or reply the AI writes for you counts as one.</p>

      {meter.unlimited ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-fg"><Icon name="autopilot" size={15} className="text-brand" /> Unlimited AI messages on your plan — send all you like.</p>
      ) : low || out ? (
        <div className="mt-3">
          <div className="flex items-end justify-between text-sm">
            <span className="text-fg">{fmt(meter.used)} <span className="text-muted">/ {fmt(meter.limit)} used</span></span>
            <span className={`text-xs font-medium ${out ? "text-danger" : low ? "text-warn" : "text-success"}`}>
              {out ? "No messages left" : `${fmt(meter.remaining)} left`}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {fmt(meter.included)} included{meter.credits > 0 ? ` + ${fmt(meter.credits)} from top-ups` : ""} · resets on the 1st
          </p>
          {out && (
            <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
              You&apos;re out of AI messages. Until you top up (or the 1st), the AI keeps drafting with smart templates — nothing stops, the writing just isn&apos;t live-AI.
            </p>
          )}
        </div>
      ) : (
        // Plenty left — stay calm and out of the way. No counts to ration; the
        // specifics only appear once it's genuinely worth acting on (low/out).
        <p className="mt-3 flex items-center gap-2 text-sm text-fg">
          <Icon name="approvals" size={15} className="text-success" />
          You&apos;ve got plenty of AI messages this month. <span className="text-muted">Resets on the 1st.</span>
        </p>
      )}

      {/* Top-ups — only surfaced when it's actually useful (running low / out). */}
      {!meter.unlimited && (low || out) && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="text-sm font-medium text-fg">{low ? "Running low — top up so nothing stalls" : "Need more this month?"}</p>
          <p className="mt-0.5 text-xs text-muted">Instant, one-time. Extra messages apply to this month — your plan price doesn&apos;t change.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {topups.map((t) => (
              <div key={t.id} className={`rounded-xl border p-3 ${t.featured ? "border-brand bg-brand-soft/15" : "border-border bg-surface"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-fg">+{fmt(t.actions)}</p>
                  {t.featured && <span className="pill bg-brand-strong text-white text-[10px]">Most popular</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{t.blurb}</p>
                <button
                  onClick={() => buy(t.id)}
                  disabled={!t.purchasable}
                  className="mt-2 block w-full rounded-lg bg-brand-strong px-3 py-1.5 text-center text-xs font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
                  title={t.purchasable ? undefined : "Connect billing to enable top-ups"}
                >
                  {`Buy · $${t.suggestedUsd}`}
                </button>
                <p className="mt-1 text-center text-[10px] text-muted">{perMessageCents(t.suggestedUsd, t.actions)}¢ per message</p>
              </div>
            ))}
          </div>
          {!billingConfigured && <p className="mt-2 text-xs text-muted">Top-ups activate once billing is connected in your workspace.</p>}
        </div>
      )}
      <EmbeddedCheckoutModal request={checkout} onClose={() => setCheckout(null)} />
    </div>
  );
}
