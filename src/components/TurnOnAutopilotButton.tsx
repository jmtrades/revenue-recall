"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { turnOnAutopilotAction } from "@/app/(app)/launch/actions";

/**
 * One-click "go live": creates + enables the default autonomous calling task so
 * the user doesn't have to assemble one by hand. It starts REAL outreach (within
 * every guardrail), so it confirms first rather than firing on a stray click.
 */
export function TurnOnAutopilotButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function turnOn() {
    setError(null);
    startTransition(async () => {
      const res = await turnOnAutopilotAction();
      if (!res.ok) {
        setError(res.error ?? "Couldn't turn on autopilot — try again.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="cta inline-flex items-center gap-2 rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90"
      >
        Turn on autopilot
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg">
        This starts the AI calling your recall queue automatically — only leads with consent, within quiet hours, on your plan. You can pause anytime.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={turnOn}
          disabled={pending}
          className="cta inline-flex items-center gap-2 rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90 disabled:opacity-70"
        >
          {pending ? "Turning on…" : "Yes, turn it on"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-full border border-border px-4 py-2.5 text-sm text-fg transition hover:bg-surface-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
