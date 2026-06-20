"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MessageTemplate } from "@/lib/templates";
import { fillTokens } from "@/lib/templates-fill";
import { ChannelIcon } from "@/components/ui";
import { toast } from "@/lib/toast";

export interface TemplateSender {
  name?: string;
  bookingUrl?: string;
}

interface DraftForm {
  id?: string; // set when editing an existing custom template
  name: string;
  channel: "email" | "sms";
  subject: string;
  body: string;
}

const EMPTY_FORM: DraftForm = { name: "", channel: "email", subject: "", body: "" };

export function TemplatesView({
  templates,
  sender,
  customIds = [],
  canAuthor = false,
}: {
  templates: MessageTemplate[];
  sender?: TemplateSender;
  /** Ids of org-authored templates — these are editable/deletable. */
  customIds?: string[];
  canAuthor?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const [channel, setChannel] = useState<"all" | "email" | "sms">("all");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customSet = new Set(customIds);
  const shown = channel === "all" ? templates : templates.filter((t) => t.channel === channel);
  const active = templates.find((t) => t.id === activeId) ?? shown[0];

  async function save() {
    if (!form || !form.name.trim() || !form.body.trim()) {
      setError("A template needs a name and a body.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          channel: form.channel,
          subject: form.channel === "email" ? form.subject.trim() : "",
          body: form.body.trim(),
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the template.");
        return;
      }
      setForm(null);
      toast("Template saved");
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save the template — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" template? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete the template.");
      else { toast("Template deleted"); startTransition(() => router.refresh()); }
    } catch {
      setError("Couldn't delete the template — check your connection.");
    } finally {
      setBusy(false);
    }
  }

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
        {canAuthor && !form && (
          <button onClick={() => { setForm(EMPTY_FORM); setError(null); }} className="w-full rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90">
            New template
          </button>
        )}
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
                <span className="flex items-center gap-1">
                  {customSet.has(t.id) && <span className="pill bg-brand-soft text-brand">Custom</span>}
                  <span className="pill gap-1 bg-surface-2 capitalize text-muted"><ChannelIcon channel={t.channel} size={12} /> {t.channel}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{t.category}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {form ? (
          <div className="space-y-3">
            <h2 className="font-semibold text-fg">{form.id ? "Edit template" : "New template"}</h2>
            <input
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              placeholder="Template name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-label="Template name"
            />
            <select
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as "email" | "sms" })}
              aria-label="Channel"
            >
              <option value="email">Email</option>
              <option value="sms">SMS / text</option>
            </select>
            {form.channel === "email" && (
              <input
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
                placeholder="Subject (optional)"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                aria-label="Subject"
              />
            )}
            <textarea
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              rows={8}
              placeholder={"Hi {{first_name}} — …\n\nTokens: {{first_name}} {{company}} {{my_name}} {{booking_link}}"}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              aria-label="Template body"
            />
            {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !form.name.trim() || !form.body.trim()} className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50">
                {busy ? "Saving…" : form.id ? "Save changes" : "Create template"}
              </button>
              <button onClick={() => { setForm(null); setError(null); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-fg">Cancel</button>
            </div>
            <p className="text-[11px] text-muted">Merge tokens fill from the conversation when inserted in the Inbox.</p>
          </div>
        ) : !active ? (
          <p className="text-sm text-muted">No templates.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-fg">{active.name}</h2>
                <p className="text-xs text-muted">{active.category} · {active.channel}</p>
              </div>
              <span className="flex items-center gap-2">
                {canAuthor && customSet.has(active.id) && (
                  <>
                    <button
                      onClick={() => { setForm({ id: active.id, name: active.name, channel: active.channel as "email" | "sms", subject: active.subject ?? "", body: active.body }); setError(null); }}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(active.id, active.name)} disabled={busy} className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50">
                      Delete
                    </button>
                  </>
                )}
                <button onClick={useTemplate} className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">{copied ? "Copied!" : "Use template"}</button>
              </span>
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
            {error && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            <p className="mt-3 text-[11px] text-muted">Copying fills your name and booking link. Contact tokens like <code className="text-brand">{"{{first_name}}"}</code> fill automatically when you insert a template from the Inbox — or stay visible for manual editing.</p>
          </>
        )}
      </div>
    </div>
  );
}
