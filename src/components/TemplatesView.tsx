"use client";

import { useState } from "react";
import type { MessageTemplate } from "@/lib/templates";

export function TemplatesView({ templates }: { templates: MessageTemplate[] }) {
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const [channel, setChannel] = useState<"all" | "email" | "sms">("all");
  const shown = channel === "all" ? templates : templates.filter((t) => t.channel === channel);
  const active = templates.find((t) => t.id === activeId) ?? shown[0];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["all", "email", "sms"] as const).map((c) => (
            <button key={c} onClick={() => setChannel(c)} className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize ${channel === c ? "bg-surface-2 text-white" : "text-muted hover:text-white"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {shown.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${active?.id === t.id ? "border-brand bg-brand-soft/20" : "border-border bg-surface hover:border-brand/50"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{t.name}</span>
                <span className="pill bg-surface-2 text-muted">{t.channel === "email" ? "✉" : "💬"} {t.channel}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{t.category}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!active ? (
          <p className="text-sm text-muted">No templates.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">{active.name}</h2>
                <p className="text-xs text-muted">{active.category} · {active.channel}</p>
              </div>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm text-white hover:bg-surface-2">Use template</button>
            </div>
            {active.subject && (
              <div className="mb-3">
                <p className="stat-label">Subject</p>
                <p className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white">{active.subject}</p>
              </div>
            )}
            <div>
              <p className="stat-label">Body</p>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-3 font-sans text-sm leading-relaxed text-white">{active.body}</pre>
            </div>
            <p className="mt-3 text-[11px] text-muted">Tokens like <code className="text-brand">{"{{first_name}}"}</code> are filled from contact data at send time.</p>
          </>
        )}
      </div>
    </div>
  );
}
