"use client";

import { useState } from "react";

const SCOPES = [
  { value: "recall_queue", label: "Revenue Recall queue (at-risk deals)" },
  { value: "all_open", label: "All open deals" },
];

/** Starts a cadence for a set of deals and reports how many were enrolled. */
export function EnrollSequence({ sequenceId }: { sequenceId: string }) {
  const [scope, setScope] = useState(SCOPES[0].value);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId, scope }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed to enroll");
      const parts = [`${b.enrolled} enrolled`];
      if (b.skipped) parts.push(`${b.skipped} already in this cadence`);
      setStatus(`${parts.join(" · ")}. The scheduler will send each step on its day.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enroll");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
        {SCOPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button onClick={start} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Starting…" : "Start cadence"}
      </button>
      {status && <span className="text-sm text-success">{status}</span>}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
