import * as React from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * One step of a multi-channel sequence, as a connected timeline node: step
 * index, channel icon, day offset, the action title + preview, and a status
 * pill. Stack several to render a cadence; `last` removes the connector tail.
 * Ported from the Revenue Recall design system.
 */
// Omit the DOM `title` attribute: this component uses `title` as a ReactNode
// (the step's headline), which is incompatible with the string DOM attribute.
export interface SequenceStepProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Step number shown in the overline. */
  index: number;
  /** Channel — picks the node icon + label. */
  channel?: "email" | "sms" | "call" | "wait";
  /** Day offset within the cadence. */
  day?: number;
  title: React.ReactNode;
  /** One-line message/preview under the title. */
  preview?: React.ReactNode;
  status?: "sent" | "scheduled" | "draft" | "upcoming";
  /** Last step — removes the connector tail. */
  last?: boolean;
}

const CHANNEL: Record<NonNullable<SequenceStepProps["channel"]>, { icon: IconName; label: string }> = {
  email: { icon: "mail", label: "Email" },
  sms: { icon: "message", label: "SMS" },
  call: { icon: "dialer", label: "Call" },
  wait: { icon: "calendar", label: "Wait" },
};
const STATUS: Record<NonNullable<SequenceStepProps["status"]>, { label: string; color: string; rgb: string }> = {
  sent: { label: "Sent", color: "var(--success)", rgb: "var(--success-rgb)" },
  scheduled: { label: "Scheduled", color: "var(--color-brand)", rgb: "var(--brand-rgb)" },
  draft: { label: "In review", color: "var(--warn)", rgb: "var(--warn-rgb)" },
  upcoming: { label: "Upcoming", color: "var(--color-muted)", rgb: "var(--muted-rgb)" },
};

export function SequenceStep({ index, channel = "email", day, title, preview, status, last = false, style, ...props }: SequenceStepProps) {
  const c = CHANNEL[channel] ?? CHANNEL.email;
  // Only show a status pill when a real status is supplied. A sequence DEFINITION
  // (template) has no per-enrollment status, so forcing a default ("upcoming")
  // would imply state that isn't real.
  const s = status ? STATUS[status] : undefined;
  return (
    <div style={{ display: "flex", gap: "1rem", ...style }} {...props}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            flex: "none",
            borderRadius: 12,
            background: "var(--color-brand-soft)",
            color: "var(--color-brand)",
            boxShadow: "inset 0 0 0 1px rgb(var(--brand-rgb) / 0.2)",
          }}
        >
          <Icon name={c.icon} size={17} />
        </span>
        {!last && <span style={{ flex: 1, width: 2, marginTop: 6, marginBottom: 6, minHeight: 22, borderRadius: 2, background: "var(--color-border)" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
            Step {index} · {c.label}{day != null ? ` · Day ${day}` : ""}
          </span>
          {s && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                borderRadius: 9999,
                padding: "0.125rem 0.5rem",
                fontSize: "0.6875rem",
                fontWeight: 600,
                background: `rgb(${s.rgb} / 0.15)`,
                color: s.color,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 999, background: s.color }} />{s.label}
            </span>
          )}
        </div>
        <div style={{ marginTop: 5, fontSize: "0.875rem", fontWeight: 600, color: "var(--color-fg)" }}>{title}</div>
        {preview && <p style={{ margin: "3px 0 0", fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</p>}
      </div>
    </div>
  );
}
