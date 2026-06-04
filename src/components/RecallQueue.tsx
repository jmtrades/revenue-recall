"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReasonBadge, ChannelBadge, ScoreDot } from "@/components/ui";
import { Icon } from "@/components/icons";
import { money, relativeDays } from "@/lib/format";

export interface RecallRow {
  opportunityId: string;
  title: string;
  contactLabel: string;
  reason: string;
  score: number;
  value: number;
  weightedValue: number;
  currency: string;
  daysSinceActivity: number;
  channel: string;
  recommendation: string;
  /** Buyer replied at least once before going quiet. */
  engaged?: boolean;
  /** Open deal whose expected close date has passed. */
  overdue?: boolean;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "no_show", label: "No-shows" },
  { id: "going_cold", label: "Going cold" },
  { id: "stalled", label: "Stalled" },
  { id: "lost_winnable", label: "Winnable losses" },
  { id: "no_activity", label: "Untouched" },
];

interface DraftState {
  row: RecallRow;
  subject?: string;
  body: string;
  source: string;
  busy: boolean;
}

export function RecallQueue({ rows }: { rows: RecallRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [copied, setCopied] = useState(false);
  const filtered = filter === "all" ? rows : rows.filter((r) => r.reason === filter);

  // Close the draft modal on Escape.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDraft(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  async function openDraft(row: RecallRow) {
    setCopied(false);
    setDraft({ row, body: "", source: "", busy: true });
    try {
      const res = await fetch(`/api/ai/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: row.opportunityId, channel: row.channel === "call" ? "email" : row.channel }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Draft failed");
      setDraft({ row, subject: b.subject, body: b.body, source: b.source, busy: false });
    } catch (e) {
      setDraft({ row, body: e instanceof Error ? e.message : "Draft failed", source: "error", busy: false });
    }
  }

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function copy() {
    if (!draft) return;
    navigator.clipboard?.writeText([draft.subject, draft.body].filter(Boolean).join("\n\n"));
    setCopied(true);
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      const channel = draft.row.channel === "call" ? "email" : draft.row.channel;
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, dealId: draft.row.opportunityId, subject: draft.subject, body: draft.body, recall: true }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => { setDraft(null); setSent(false); router.refresh(); }, 800);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? rows.length : rows.filter((r) => r.reason === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${filter === f.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-white"}`}
            >
              {f.label} <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card p-0">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">Nothing here right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Why</th>
                <th className="px-4 py-3 font-medium">Recoverable</th>
                <th className="px-4 py-3 font-medium">Last touch</th>
                <th className="px-4 py-3 font-medium">Next best action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.opportunityId}
                  onClick={() => router.push(`/deals/${r.opportunityId}`)}
                  className="cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-surface-2/40"
                >
                  <td className="px-4 py-4"><ScoreDot score={r.score} /></td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-fg">{r.title}</div>
                    <div className="text-xs text-muted">{r.contactLabel}</div>
                  </td>
                  <td className="px-4 py-4"><ReasonBadge reason={r.reason} /></td>
                  <td className="px-4 py-4 tabular-nums text-fg">
                    {money(r.weightedValue, r.currency)}
                    <div className="text-xs text-muted">of {money(r.value, r.currency)}</div>
                  </td>
                  <td className="px-4 py-4 text-muted">{relativeDays(r.daysSinceActivity)}</td>
                  <td className="px-4 py-4">
                    <div className="mb-2 flex items-center gap-2">
                      <ChannelBadge channel={r.channel} />
                      {r.engaged && (
                        <span className="pill bg-brand-soft/40 text-brand" title="This buyer replied before going quiet — a warmer, more recoverable deal.">
                          ↩ Replied before
                        </span>
                      )}
                      {r.overdue && (
                        <span className="pill bg-rose-500/15 text-rose-400" title="This deal's expected close date has already passed.">
                          ⏰ Past close date
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openDraft(r); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand-soft/30 px-2 py-0.5 text-xs font-medium text-brand transition hover:bg-brand-soft/50"
                      >
                        <Icon name="autopilot" size={12} /> Draft
                      </button>
                    </div>
                    <p className="max-w-md text-xs leading-relaxed text-muted">{r.recommendation}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="AI draft" className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={15} className="text-brand" /> Drafted outreach</h3>
              <button onClick={() => setDraft(null)} aria-label="Close" className="text-muted transition-colors hover:text-fg"><Icon name="close" size={16} /></button>
            </div>
            <p className="mb-3 text-xs text-muted">{draft.row.title} · {draft.row.contactLabel}</p>
            {draft.busy ? (
              <p className="py-8 text-center text-sm text-muted">Drafting with AI…</p>
            ) : (
              <>
                {draft.subject && (
                  <div className="mb-2">
                    <p className="stat-label">Subject</p>
                    <p className="mt-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg">{draft.subject}</p>
                  </div>
                )}
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-3 font-sans text-sm leading-relaxed text-fg">{draft.body}</pre>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted">{draft.source === "ai" ? "Generated by Claude" : draft.source === "error" ? "" : "Template — connect AI for tailored drafts"}</span>
                  <div className="flex gap-2">
                    <button onClick={() => openDraft(draft.row)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">Regenerate</button>
                    <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">{copied ? <><Icon name="check" size={13} strokeWidth={3} className="text-success" /> Copied</> : "Copy"}</button>
                    {draft.source !== "error" && (
                      <button onClick={send} disabled={sending || sent} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60">
                        {sent ? <><Icon name="check" size={13} strokeWidth={3} /> Sent</> : sending ? "Sending…" : draft.row.channel === "sms" ? "Send SMS" : "Send"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
