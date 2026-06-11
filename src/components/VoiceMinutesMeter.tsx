"use client";

import { Icon } from "@/components/icons";

export interface VoiceMinutesMeterProps {
  /** Sanitized server-side — no Infinity crosses to the client. */
  meter: { usedMin: number; includedMin: number; remainingMin: number; fraction: number; unlimited: boolean };
  planName: string;
  /** Estimated calls left at the planning average (~3 min/call). */
  callsLeft: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * Customer-facing voice-minute meter — the phone-call companion to the AI-
 * messages meter. Read-only: minutes don't top up à la carte (the path is an
 * upgrade), so this shows what's left and, when it's gone, exactly what still
 * works. A plan with zero phone minutes (free) gets the honest "practice is
 * free, calling needs a plan" framing instead of an empty bar.
 */
export function VoiceMinutesMeter({ meter, planName, callsLeft }: VoiceMinutesMeterProps) {
  const pct = Math.round(meter.fraction * 100);
  const low = !meter.unlimited && meter.includedMin > 0 && meter.fraction >= 0.8;
  const out = !meter.unlimited && meter.includedMin > 0 && meter.remainingMin <= 0;
  const noPlanMinutes = !meter.unlimited && meter.includedMin <= 0;
  const barColor = out ? "bg-danger" : low ? "bg-warn" : "bg-brand";

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">AI call minutes this month</p>
        <span className="pill bg-surface-2 text-muted">{planName}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">Connected talk time when the AI is on a real call for you — premium human voice. Practice &amp; role-play calls are always free.</p>

      {meter.unlimited ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-fg"><Icon name="dialer" size={15} className="text-brand" /> Unlimited AI call minutes on your plan.</p>
      ) : noPlanMinutes ? (
        <div className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
          <p className="text-sm text-fg">Your plan doesn&apos;t include live phone calls yet.</p>
          <p className="mt-0.5 text-xs text-muted">On-device practice &amp; role-play stay free and unlimited. Upgrade to put the AI on real calls in a premium human voice.</p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-end justify-between text-sm">
            <span className="text-fg">{fmt(meter.usedMin)} <span className="text-muted">/ {fmt(meter.includedMin)} min used</span></span>
            <span className={`text-xs font-medium ${out ? "text-danger" : low ? "text-warn" : "text-success"}`}>
              {out ? "No minutes left" : `${fmt(meter.remainingMin)} min left · ~${callsLeft} calls`}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{fmt(meter.includedMin)} min included · resets on the 1st</p>
          {out && (
            <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
              You&apos;re out of call minutes for this month. The dialer pauses until the 1st or an upgrade — email, SMS, and practice calls keep working.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
