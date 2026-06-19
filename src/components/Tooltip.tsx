"use client";

import * as React from "react";

/**
 * Hover/focus tooltip. Wraps its child trigger; shows a small dark label on
 * hover or keyboard focus, positioned above (default) or on any side. CSS-only
 * reveal — no portal — so it works anywhere. Ported from the Revenue Recall
 * design system. Scale values inlined (the repo is Tailwind-first); colors +
 * motion use the shared tokens.
 */
export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Tooltip text/content. */
  label: React.ReactNode;
  /** Which side of the trigger to show on. Default "top". */
  side?: "top" | "bottom" | "left" | "right";
  /** The trigger element(s). */
  children: React.ReactNode;
}

export function Tooltip({ label, side = "top", children, style, ...props }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const pos: React.CSSProperties = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: `translateX(-50%) translateY(${open ? "0" : "4px"})` },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: `translateX(-50%) translateY(${open ? "0" : "-4px"})` },
    left: { right: "calc(100% + 8px)", top: "50%", transform: `translateY(-50%) translateX(${open ? "0" : "4px"})` },
    right: { left: "calc(100% + 8px)", top: "50%", transform: `translateY(-50%) translateX(${open ? "0" : "-4px"})` },
  }[side];
  return (
    <span
      style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...props}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: "absolute",
          zIndex: 50,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          ...pos,
          opacity: open ? 1 : 0,
          transition: "opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
          background: "var(--color-surface-2)",
          color: "var(--color-fg)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "0.3125rem 0.5rem",
          fontSize: "0.75rem",
          fontWeight: 500,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        {label}
      </span>
    </span>
  );
}
