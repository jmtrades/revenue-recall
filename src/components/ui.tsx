import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

const AVATAR_COLORS = ["#5b8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#fb923c"];

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-fg"
      style={{ width: size, height: size, background: AVATAR_COLORS[idx], fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="font-semibold text-fg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  size = "md",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand/90",
    ghost: "text-muted hover:bg-surface-2 hover:text-fg",
    outline: "border border-border text-fg hover:bg-surface-2",
    danger: "bg-danger/90 text-white hover:bg-danger",
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

export function EmptyState({ icon = "◌", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-12 text-center">
      <div className="text-3xl text-muted/60">{icon}</div>
      <p className="mt-2 text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm text-fg">{children}</span>
    </div>
  );
}

const ACTIVITY_ICON: Record<string, IconName> = {
  call: "dialer",
  email: "mail",
  sms: "message",
  meeting: "calendar",
  note: "note",
  task: "tasks",
  stage_change: "forecast",
};

export function ActivityIcon({ kind }: { kind: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted">
      <Icon name={ACTIVITY_ICON[kind] ?? "recall"} size={15} />
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "default" | "success" | "warn" | "danger" }) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg";
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

const CHANNEL_ICON: Record<string, IconName> = { call: "dialer", email: "mail", sms: "message", note: "note" };

export function ChannelIcon({ channel, size = 13, className = "" }: { channel: string; size?: number; className?: string }) {
  return <Icon name={CHANNEL_ICON[channel] ?? "recall"} size={size} className={`inline-block shrink-0 ${className}`} />;
}

export function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, { icon: IconName; label: string }> = {
    call: { icon: "dialer", label: "Call" },
    email: { icon: "mail", label: "Email" },
    sms: { icon: "message", label: "SMS" },
  };
  const c = map[channel] ?? { icon: "recall" as IconName, label: channel };
  return (
    <span className="pill gap-1 bg-surface-2 text-muted">
      <Icon name={c.icon} size={12} /> {c.label}
    </span>
  );
}

export function ScoreDot({ score }: { score: number }) {
  const color = score >= 75 ? "bg-danger" : score >= 50 ? "bg-warn" : "bg-brand";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="tabular-nums text-sm text-fg">{score}</span>
    </span>
  );
}
