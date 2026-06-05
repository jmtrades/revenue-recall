"use client";

import { useState } from "react";
import type { Automation } from "@/lib/automations";

export function AutomationsList({ automations }: { automations: Automation[] }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(automations.map((a) => [a.id, a.enabled])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeCount = Object.values(enabled).filter(Boolean).length;

  // Persist the toggle so it survives a refresh (and is a real master switch the
  // engine reads). Optimistic, with a revert + message if the save fails.
  async function toggle(id: string) {
    const next = !enabled[id];
    setEnabled((e) => ({ ...e, [id]: next }));
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: next }) });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setEnabled((e) => ({ ...e, [id]: !next }));
        setError(b.error ?? "Couldn't save. Try again.");
      }
    } catch {
      setEnabled((e) => ({ ...e, [id]: !next }));
      setError("Couldn't save. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{activeCount} of {automations.length} automations active</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {automations.map((a) => (
          <section key={a.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-fg">{a.name}</h2>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
              </div>
              <button
                onClick={() => toggle(a.id)}
                disabled={savingId === a.id}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${enabled[a.id] ? "border-success bg-success" : "border-border bg-surface-2"}`}
                aria-label="Toggle automation"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${enabled[a.id] ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="pill bg-brand-soft text-brand">Trigger</span>
                <span className="text-fg">{a.trigger.label}</span>
              </div>
              <ol className="mt-2 space-y-1">
                {a.actions.map((act, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted">
                    <span className="text-brand">↳</span> {act}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
