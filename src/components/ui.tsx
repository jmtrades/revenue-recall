import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "default" | "success" | "warn" | "danger" }) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div className="card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const REASON_STYLES: Record<string, { label: string; cls: string }> = {
  going_cold: { label: "Going cold", cls: "bg-warn/15 text-warn" },
  stalled: { label: "Stalled", cls: "bg-danger/15 text-danger" },
  lost_winnable: { label: "Winnable loss", cls: "bg-brand-soft text-brand" },
  no_activity: { label: "Untouched", cls: "bg-surface-2 text-muted" },
};

export function ReasonBadge({ reason }: { reason: string }) {
  const s = REASON_STYLES[reason] ?? { label: reason, cls: "bg-surface-2 text-muted" };
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = { call: "📞 Call", email: "✉ Email", sms: "💬 SMS" };
  return <span className="pill bg-surface-2 text-muted">{map[channel] ?? channel}</span>;
}

export function ScoreDot({ score }: { score: number }) {
  const color = score >= 75 ? "bg-danger" : score >= 50 ? "bg-warn" : "bg-brand";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="tabular-nums text-sm text-white">{score}</span>
    </span>
  );
}
