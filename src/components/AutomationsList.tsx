"use client";

import { useState } from "react";
import type { Automation } from "@/lib/automations";

export function AutomationsList({ automations }: { automations: Automation[] }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(automations.map((a) => [a.id, a.enabled])),
  );
  const activeCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{activeCount} of {automations.length} automations active</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {automations.map((a) => (
          <section key={a.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-fg">{a.name}</h2>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
              </div>
              <button
                onClick={() => setEnabled((e) => ({ ...e, [a.id]: !e[a.id] }))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled[a.id] ? "bg-success" : "bg-surface-2"}`}
                aria-label="Toggle automation"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled[a.id] ? "left-[22px]" : "left-0.5"}`} />
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
