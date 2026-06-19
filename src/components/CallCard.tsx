"use client";

import * as React from "react";
import { Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/ui";

/**
 * Power-dialer call card — live call state for one contact: avatar + name,
 * company, the deal, a live status pill with timer, an AI talk-track line, and
 * the call controls (mute / dialpad / end). Ported from the Revenue Recall
 * design system; scale values inlined, colors + motion use the shared tokens.
 */
export interface CallCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Contact name (drives the avatar). */
  name: string;
  company?: string;
  phone?: string;
  /** Deal this call is about. */
  deal?: string;
  /** Live call state. */
  status?: "ringing" | "connected" | "ended";
  /** Call timer, pre-formatted, e.g. "01:24". */
  timer?: string;
  /** AI-generated talk-track line shown to the rep. */
  talkTrack?: string;
}

const STATUS: Record<NonNullable<CallCardProps["status"]>, { label: string; color: string }> = {
  ringing: { label: "Ringing…", color: "var(--warn)" },
  connected: { label: "Connected", color: "var(--success)" },
  ended: { label: "Call ended", color: "var(--color-muted)" },
};

function Control({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: "grid",
        placeItems: "center",
        width: 44,
        height: 44,
        flex: "none",
        borderRadius: 9999,
        cursor: "pointer",
        border: danger ? "1px solid transparent" : "1px solid var(--color-border)",
        background: danger ? "rgb(var(--danger-rgb) / 0.9)" : "var(--color-surface-2)",
        color: danger ? "#fff" : "var(--color-body)",
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

export function CallCard({ name, company, deal, phone, status = "connected", timer = "01:24", talkTrack, style, ...props }: CallCardProps) {
  const s = STATUS[status] ?? STATUS.connected;
  return (
    <div
      style={{
        width: "min(380px, 94vw)",
        boxSizing: "border-box",
        borderRadius: 16,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        padding: "1.5rem",
        backgroundImage: "linear-gradient(rgb(255 255 255 / 0.035), transparent 38%)",
        boxShadow: "var(--shadow-raised)",
        ...style,
      }}
      {...props}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.75rem", fontWeight: 600, color: s.color }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: s.color, animation: status === "ringing" ? "rr-pulse 1s var(--ease-in-out) infinite" : undefined }} />
          {s.label}
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", fontSize: "0.875rem", color: "var(--color-muted)" }}>{timer}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1.25rem" }}>
        <Avatar name={name} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.125rem", color: "var(--color-fg)" }}>{name}</div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>{[company, phone].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      {deal && (
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", color: "var(--color-body)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: "var(--color-brand-soft)", color: "var(--color-brand)", flex: "none" }}><Icon name="recall" size={14} /></span>
          {deal}
        </div>
      )}
      {talkTrack && (
        <div style={{ marginTop: "1rem", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", padding: "0.75rem 0.875rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-brand)", marginBottom: 6 }}>AI talk track</div>
          <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-body)" }}>{talkTrack}</p>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1.5rem" }}>
        <Control icon="mute" label="Mute" />
        <Control icon="dialer" label="Keypad" />
        <Control icon="stop" label="End call" danger />
      </div>
    </div>
  );
}
