import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { CountUp } from "@/components/CountUp";

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
    primary: "bg-brand-strong text-white hover:bg-brand-strong/90",
    ghost: "text-muted hover:bg-surface-2 hover:text-fg",
    outline: "border border-border text-fg hover:bg-surface-2",
    danger: "bg-danger/90 text-white hover:bg-danger",
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

export function EmptyState({
  iconName,
  icon,
  title,
  hint,
  action,
}: {
  iconName?: IconName;
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
        {iconName ? <Icon name={iconName} size={22} /> : icon ? <span className="text-xl text-muted/70">{icon}</span> : <Icon name="inbox" size={22} />}
      </span>
      <p className="mt-4 text-sm font-semibold text-fg">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
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

export function Stat({
  label,
  value,
  hint,
  tone,
  delta,
  icon,
  countUp,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warn" | "danger";
  /** Period-over-period change, e.g. +12 or -5 (rendered as a colored ↑/↓ chip). */
  delta?: number;
  icon?: IconName;
  /** Animate the value counting up on mount (headline rows). Reduced-motion safe. */
  countUp?: boolean;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg";
  const up = (delta ?? 0) >= 0;
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="stat-label">{label}</p>
        {icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft/60 text-brand ring-1 ring-inset ring-brand/15">
            <Icon name={icon} size={14} />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`stat-value !mt-0 ${toneClass}`}>{countUp ? <CountUp value={value} /> : value}</p>
        {delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${up ? "text-success" : "text-danger"}`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {up ? <path d="M7 17 17 7M17 7H9M17 7v8" /> : <path d="M7 7l10 10M17 17H9M17 17V9" />}
            </svg>
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const REASON_STYLES: Record<string, { label: string; cls: string }> = {
  no_show: { label: "No-show", cls: "bg-brand/15 text-brand" },
  going_cold: { label: "Going cold", cls: "bg-warn/15 text-warn" },
  stalled: { label: "Stalled", cls: "bg-danger/15 text-danger" },
  lost_winnable: { label: "Winnable loss", cls: "bg-brand-soft text-brand" },
  no_activity: { label: "Untouched", cls: "bg-surface-2 text-muted" },
  new_lead: { label: "New lead", cls: "bg-success/15 text-success" },
};

export function ReasonBadge({ reason }: { reason: string }) {
  const s = REASON_STYLES[reason] ?? { label: reason, cls: "bg-surface-2 text-muted" };
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

const CHANNEL_ICON: Record<string, IconName> = {
  call: "dialer",
  email: "mail",
  sms: "message",
  note: "note",
  // Social DMs all render with the message glyph; the label disambiguates them.
  whatsapp: "message",
  instagram: "message",
  messenger: "message",
  telegram: "message",
  linkedin: "message",
  x: "message",
};

export function ChannelIcon({ channel, size = 13, className = "" }: { channel: string; size?: number; className?: string }) {
  return <Icon name={CHANNEL_ICON[channel] ?? "recall"} size={size} className={`inline-block shrink-0 ${className}`} />;
}

const CHANNEL_LABEL: Record<string, string> = {
  call: "Call",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  linkedin: "LinkedIn",
  x: "X",
};

/** Human label for a channel id (e.g. "whatsapp" → "WhatsApp"). */
export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function ChannelBadge({ channel }: { channel: string }) {
  const icon = CHANNEL_ICON[channel] ?? ("recall" as IconName);
  return (
    <span className="pill gap-1 bg-surface-2 text-muted">
      <Icon name={icon} size={12} /> {channelLabel(channel)}
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
