"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Acknowledges the return from Stripe Checkout. Stripe sends the user back to
 * /settings?billing=success|cancelled; without this they'd land on a plain page
 * with no confirmation right after paying — eroding trust at the money moment.
 * Dismissible; render only when the param is present.
 */
export function BillingReturnBanner({ status }: { status: "success" | "cancelled" }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const success = status === "success";
  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-xl border p-4 ${
        success ? "border-success/40 bg-success/[0.07]" : "border-border bg-surface"
      }`}
    >
      <span
        className={`grid h-9 w-9 flex-none place-items-center rounded-xl ring-1 ring-inset ${
          success ? "bg-success/15 text-success ring-success/25" : "bg-surface-2 text-muted ring-border"
        }`}
      >
        <Icon name={success ? "check" : "recall"} size={18} strokeWidth={success ? 3 : 1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">
          {success ? "You're subscribed — welcome aboard." : "Checkout cancelled"}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">
          {success
            ? "Your plan is active. It can take a few seconds to reflect here — refresh if your limits haven't updated yet."
            : "No charge was made. You can pick a plan whenever you're ready below."}
        </p>
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
