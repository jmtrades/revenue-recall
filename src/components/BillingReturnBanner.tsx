"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";

type Status = "success" | "topup" | "cancelled";

const COPY: Record<Status, { positive: boolean; icon: IconName; title: string; body: string }> = {
  success: {
    positive: true,
    icon: "check",
    title: "You're subscribed — welcome aboard.",
    body: "Your plan is active. It can take a few seconds to reflect here — refresh if your limits haven't updated yet.",
  },
  topup: {
    positive: true,
    icon: "check",
    title: "Top-up purchased — credits on the way.",
    body: "Your extra actions will appear on the usage meter below in a few seconds. Refresh if you don't see them yet.",
  },
  cancelled: {
    positive: false,
    icon: "recall",
    title: "Checkout cancelled",
    body: "No charge was made. You can pick a plan or top-up whenever you're ready below.",
  },
};

/**
 * Acknowledges the return from Stripe Checkout. Stripe sends the user back to
 * /settings?billing=success|topup|cancelled; without this they'd land on a plain
 * page with no confirmation right after paying — eroding trust at the money
 * moment. Dismissible; render only when the param is present.
 */
export function BillingReturnBanner({ status }: { status: Status }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const c = COPY[status];
  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-xl border p-4 ${
        c.positive ? "border-success/40 bg-success/[0.07]" : "border-border bg-surface"
      }`}
    >
      <span
        className={`grid h-9 w-9 flex-none place-items-center rounded-xl ring-1 ring-inset ${
          c.positive ? "bg-success/15 text-success ring-success/25" : "bg-surface-2 text-muted ring-border"
        }`}
      >
        <Icon name={c.icon} size={18} strokeWidth={c.positive ? 3 : 1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{c.title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{c.body}</p>
      </div>
      <button
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="rounded-lg p-1 text-muted transition-colors hover:text-fg"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
