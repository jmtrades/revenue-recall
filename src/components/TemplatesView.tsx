"use client";

import { useState } from "react";
import type { MessageTemplate } from "@/lib/templates";
import { fillTokens } from "@/lib/templates-fill";
import { ChannelIcon } from "@/components/ui";

export interface TemplateSender {
  name?: string;
  bookingUrl?: string;
}

export function TemplatesView({ templates, sender }: { templates: MessageTemplate[]; sender?: TemplateSender }) {
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const [channel, setChannel] = useState<"all" | "email" | "sms">("all");
  const [copied, setCopied] = useState(false);
  const shown = channel === "all" ? templates : templates.filter((t) => t.channel === channel);
  const active = templates.find((t) => t.id === activeId) ?? shown[0];

  function useTemplate() {
    if (!active) return;
    // Fill what this page knows (the sender's name + booking link); contact
    // tokens stay visible here and resolve when inserting from a conversation.
    const text = fillTokens([active.subject, active.body].filter(Boolean).join("\n\n"), {
      senderName: sender?.name,
      bookingUrl: sender?.bookingUrl,
    });
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => undefined,
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["all", "email", "sms"] as const).map((c) => (
            <button key={c} onClick={() => setChannel(c)} className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize ${channel === c ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}>
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
                <span className="text-sm font-medium text-fg">{t.name}</span>
                <span className="pill gap-1 bg-surface-2 capitalize text-muted"><ChannelIcon channel={t.channel} size={12} /> {t.channel}</span>
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
                <h2 className="font-semibold text-fg">{active.name}</h2>
                <p className="text-xs text-muted">{active.category} · {active.channel}</p>
              </div>
              <button onClick={useTemplate} className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">{copied ? "Copied!" : "Use template"}</button>
            </div>
            {active.subject && (
              <div className="mb-3">
                <p className="stat-label">Subject</p>
                <p className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg">{active.subject}</p>
              </div>
            )}
            <div>
              <p className="stat-label">Body</p>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-3 font-sans text-sm leading-relaxed text-fg">{active.body}</pre>
            </div>
            <p className="mt-3 text-[11px] text-muted">Copying fills your name and booking link. Contact tokens like <code className="text-brand">{"{{first_name}}"}</code> fill automatically when you insert a template from the Inbox — or stay visible for manual editing.</p>
          </>
        )}
      </div>
    </div>
  );
}
