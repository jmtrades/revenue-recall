"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { EmbeddedCheckoutModal, type CheckoutRequest } from "@/components/EmbeddedCheckoutModal";

export interface VoiceMinutePack {
  id: string;
  actions: number; // minutes granted
  suggestedUsd: number;
  blurb: string;
  featured: boolean;
  purchasable: boolean;
}

export interface VoiceMinutesMeterProps {
  /** Sanitized server-side — no Infinity crosses to the client. */
  meter: { usedMin: number; includedMin: number; creditsMin: number; limitMin: number; remainingMin: number; fraction: number; unlimited: boolean };
  planName: string;
  /** Estimated calls left at the planning average (~3 min/call). */
  callsLeft: number;
  /** Talk-minute top-up packs (purchasable once Stripe prices exist). */
  packs: VoiceMinutePack[];
  billingConfigured: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const perMinCents = (usd: number, minutes: number) => (minutes > 0 ? Math.round(((usd * 100) / minutes) * 10) / 10 : 0);

/**
 * Customer-facing voice-minute meter — the phone-call companion to the AI-
 * messages meter, with minute TOP-UPS so a hot streak never hard-stops: the
 * pool is plan minutes + purchased minutes, and when it runs low the packs are
 * right there. A plan with zero phone minutes (free) gets the honest "practice
 * is free, calling needs a plan" framing instead of an empty bar — but if such
 * an org buys minutes, the meter counts them down like anyone else's.
 */
export function VoiceMinutesMeter({ meter, planName, callsLeft, packs, billingConfigured }: VoiceMinutesMeterProps) {
  const [checkout, setCheckout] = useState<CheckoutRequest | null>(null);

  const pct = Math.round(meter.fraction * 100);
  const metered = !meter.unlimited && meter.limitMin > 0;
  const low = metered && meter.fraction >= 0.8;
  const out = metered && meter.remainingMin <= 0;
  const noPlanMinutes = !meter.unlimited && meter.limitMin <= 0;
  const barColor = out ? "bg-danger" : low ? "bg-warn" : "bg-brand";

  function buy(pack: string) {
    setCheckout({ endpoint: "/api/billing/topup", body: { pack } });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Talk minutes this month</p>
        <span className="pill bg-surface-2 text-muted">{planName}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">Connected talk time on real calls, billed per second — no-answers are free, voicemail drops run ~30s. Practice &amp; role-play are always free.</p>

      {meter.unlimited ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-fg"><Icon name="dialer" size={15} className="text-brand" /> Unlimited talk minutes on your plan.</p>
      ) : noPlanMinutes ? (
        <div className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
          <p className="text-sm text-fg">Your plan doesn&apos;t include live phone calls yet.</p>
          <p className="mt-0.5 text-xs text-muted">On-device practice &amp; role-play stay free and unlimited. Upgrade to put the AI on real calls — it works your whole list, all day.</p>
        </div>
      ) : low || out ? (
        <div className="mt-3">
          <div className="flex items-end justify-between text-sm">
            <span className="text-fg">{fmt(meter.usedMin)} <span className="text-muted">/ {fmt(meter.limitMin)} min used</span></span>
            <span className={`text-xs font-medium ${out ? "text-danger" : low ? "text-warn" : "text-success"}`}>
              {out ? "No minutes left" : `${fmt(meter.remainingMin)} min left · ~${callsLeft} calls`}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {fmt(meter.includedMin)} min included{meter.creditsMin > 0 ? ` + ${fmt(meter.creditsMin)} from top-ups` : ""} · resets on the 1st
          </p>
          {out && (
            <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
              You&apos;re out of talk minutes. Top up below to keep dialing right now — email, SMS, and practice calls never stop either way.
            </p>
          )}
        </div>
      ) : (
        // Plenty of calling left — reassure, don't make them ration. Specifics
        // (and the top-up packs) only appear once it's genuinely worth acting on.
        <p className="mt-3 flex items-center gap-2 text-sm text-fg">
          <Icon name="approvals" size={15} className="text-success" />
          Plenty of calling left this month — enough to keep working your whole list. <span className="text-muted">Resets on the 1st.</span>
        </p>
      )}

      {/* Minute top-ups — the "never stall a hot streak" path; shown when low/out. */}
      {!meter.unlimited && (low || out) && packs.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="text-sm font-medium text-fg">{out ? "Top up and keep dialing" : low ? "Running low — add minutes so the dialer never stops" : "Need more minutes this month?"}</p>
          <p className="mt-0.5 text-xs text-muted">Instant, one-time. Extra minutes apply to this month — your plan price doesn&apos;t change.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {packs.map((t) => (
              <div key={t.id} className={`rounded-xl border p-3 ${t.featured ? "border-brand bg-brand-soft/15" : "border-border bg-surface"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-fg">+{t.actions.toLocaleString()} min</p>
                  {t.featured && <span className="pill bg-brand text-white text-[10px]">Most popular</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{t.blurb}</p>
                <button
                  onClick={() => buy(t.id)}
                  disabled={!t.purchasable}
                  className="mt-2 block w-full rounded-lg bg-brand px-3 py-1.5 text-center text-xs font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
                  title={t.purchasable ? undefined : "Connect billing to enable top-ups"}
                >
                  {`Buy · $${t.suggestedUsd}`}
                </button>
                <p className="mt-1 text-center text-[10px] text-muted">{perMinCents(t.suggestedUsd, t.actions)}¢ per minute</p>
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
