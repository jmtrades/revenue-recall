"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * The global "pause all autonomous sending" kill switch — the panic brake for an
 * agent that acts on the user's behalf. When on, autopilot and sequences draft to
 * Approvals instead of sending; nothing else changes. Two surfaces: a persistent
 * banner (so a paused workspace is unmistakable app-wide) and a settings toggle.
 */
async function persist(paused: boolean): Promise<void> {
  const res = await fetch("/api/org", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sendingPaused: paused }),
  });
  if (!res.ok) throw new Error("Failed to update");
}

/** App-wide banner shown only while sending is paused, with a one-click resume. */
export function SendingPausedBanner({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  if (!paused) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2 sm:px-8">
      <span className="flex items-center gap-2 text-sm font-medium text-warn">
        <Icon name="stop" size={14} className="flex-none" />
        Autonomous sending is paused — autopilot &amp; sequences are drafting to Approvals; nothing is going out.
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { await persist(false); setPaused(false); } catch { /* leave paused */ } finally { setBusy(false); }
        }}
        className="rounded-lg bg-warn px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Resuming…" : "Resume sending"}
      </button>
    </div>
  );
}

/** Settings toggle to pause/resume all autonomous sending. */
export function SendingPauseToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    setBusy(true);
    setError(false);
    const next = !paused;
    try { await persist(next); setPaused(next); } catch { setError(true); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-fg">Pause all autonomous sending</p>
        <p className="text-xs text-muted">
          Emergency brake. Autopilot and sequences draft to Approvals instead of sending — nothing else changes, and you can resume anytime.
          {error && <span className="ml-1 text-danger">Couldn&apos;t save — try again.</span>}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={paused}
        aria-label="Pause all autonomous sending"
        disabled={busy}
        onClick={toggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${paused ? "bg-warn" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${paused ? "left-4" : "left-0.5"}`} />
      </button>
    </div>
  );
}
