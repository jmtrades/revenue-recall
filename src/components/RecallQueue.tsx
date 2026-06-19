"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReasonBadge, ChannelBadge, ScoreDot } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SpeakButton } from "@/components/SpeakButton";
import { money, relativeDays } from "@/lib/format";
import { TEMPLATE_FALLBACK_LABEL } from "@/lib/copy";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";

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
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const visible = rows.filter((r) => !hidden.has(r.opportunityId));
  const filtered = filter === "all" ? visible : visible.filter((r) => r.reason === filter);

  // Close the draft modal on Escape; trap focus inside it while open.
  useEscapeKey(Boolean(draft), () => setDraft(null));
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(draft));

  async function openDraft(row: RecallRow) {
    setCopied(false);
    setDraft({ row, body: "", source: "", busy: true });
    try {
      const res = await fetch(`/api/ai/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Draft for the channel we're actually recommending — a call gets a
        // call script, not a silently-substituted email.
        body: JSON.stringify({ dealId: row.opportunityId, channel: row.channel }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Draft failed");
      setDraft({ row, subject: b.subject, body: b.body, source: b.source, busy: false });
    } catch (e) {
      setDraft({ row, body: e instanceof Error ? e.message : "Draft failed", source: "error", busy: false });
    }
  }

  // Mute a deal in the queue for a while so it stops nagging (it returns when
  // the snooze lapses). Optimistically hide the row; the refresh reconciles.
  async function snooze(row: RecallRow, days: number) {
    setSnoozingId(row.opportunityId);
    try {
      const res = await fetch("/api/recall/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: row.opportunityId, days }),
      });
      if (res.ok) {
        setHidden((h) => new Set(h).add(row.opportunityId));
        router.refresh();
      }
    } catch {
      /* leave it visible; a refresh will reconcile */
    } finally {
      setSnoozingId(null);
    }
  }

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function copy() {
    if (!draft) return;
    navigator.clipboard?.writeText([draft.subject, draft.body].filter(Boolean).join("\n\n"));
    setCopied(true);
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: draft.row.channel, dealId: draft.row.opportunityId, subject: draft.subject, body: draft.body, recall: true }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => { setDraft(null); setSent(false); router.refresh(); }, 800);
      } else {
        const b = await res.json().catch(() => ({}));
        setSendError(b.error ?? "Couldn't send. Try again.");
      }
    } catch {
      setSendError("Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  // A call can't be "sent" — log that the call happened (with the script as the
  // note) so the deal advances and drops out of the queue, instead of silently
  // firing off an email behind the user's back.
  async function logCall() {
    if (!draft) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/opportunities/${draft.row.opportunityId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "call", summary: draft.body }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => { setDraft(null); setSent(false); router.refresh(); }, 800);
      } else {
        const b = await res.json().catch(() => ({}));
        setSendError(b.error ?? "Couldn't log the call. Try again.");
      }
    } catch {
      setSendError("Couldn't log the call. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? visible.length : visible.filter((r) => r.reason === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${filter === f.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-fg"}`}
            >
              {f.label} <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-x-auto p-0">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); snooze(r, 7); }}
                        disabled={snoozingId === r.opportunityId}
                        title="Mute this deal in the queue for a week"
                        className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted transition hover:text-fg disabled:opacity-50"
                      >
                        {snoozingId === r.opportunityId ? "Snoozing…" : "Snooze 7d"}
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
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="AI draft" className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={15} className="text-brand" /> {draft.row.channel === "call" ? "Call script" : "Drafted outreach"}</h3>
              <div className="flex items-center gap-2">
                {!draft.busy && draft.source !== "error" && draft.body && (
                  <SpeakButton text={[draft.subject, draft.body].filter(Boolean).join(". ")} label={draft.row.channel === "call" ? "Hear it" : "Read"} />
                )}
                <button onClick={() => setDraft(null)} aria-label="Close" className="text-muted transition-colors hover:text-fg"><Icon name="close" size={16} /></button>
              </div>
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
                {draft.source === "error" ? (
                  <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">{draft.body}</p>
                ) : (
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-3 font-sans text-sm leading-relaxed text-fg">{draft.body}</pre>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted">{draft.source === "ai" ? "Generated by Claude" : draft.source === "error" ? "Couldn't draft — try Regenerate" : TEMPLATE_FALLBACK_LABEL}</span>
                  <div className="flex gap-2">
                    <button onClick={() => openDraft(draft.row)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">Regenerate</button>
                    {draft.source !== "error" && (
                      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2">{copied ? <><Icon name="check" size={13} strokeWidth={3} className="text-success" /> Copied</> : "Copy"}</button>
                    )}
                    {draft.source !== "error" && (
                      draft.row.channel === "call" ? (
                        <button onClick={logCall} disabled={sending || sent} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60">
                          {sent ? <><Icon name="check" size={13} strokeWidth={3} /> Logged</> : sending ? "Logging…" : "Log call"}
                        </button>
                      ) : (
                        <button onClick={send} disabled={sending || sent} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60">
                          {sent ? <><Icon name="check" size={13} strokeWidth={3} /> Sent</> : sending ? "Sending…" : draft.row.channel === "sms" ? "Send SMS" : "Send email"}
                        </button>
                      )
                    )}
                  </div>
                </div>
                {sendError && <p className="mt-2 text-right text-xs text-danger">{sendError}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
