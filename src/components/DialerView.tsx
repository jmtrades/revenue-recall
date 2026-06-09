"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { CallQueueItem } from "@/lib/queries";
import { Icon } from "@/components/icons";
import { Avatar, ReasonBadge, ScoreDot, EmptyState } from "@/components/ui";
import { RolePlay } from "@/components/RolePlay";
import { SpeakButton } from "@/components/SpeakButton";

interface Brief {
  summary: string;
  nextStep: string;
  talkingPoints: string[];
  risk: string;
  source: string;
  /** A ready voicemail to leave if they don't pick up. */
  voicemail?: string;
}

interface CallSummary {
  summary: string;
  outcome: string;
  sentiment: string;
  nextStep: string;
  source: string;
}

const OUTCOME_LABEL: Record<string, string> = {
  connected: "Connected",
  voicemail: "Voicemail",
  no_answer: "No answer",
  callback_scheduled: "Callback set",
  not_interested: "Not interested",
  meeting_booked: "Meeting booked",
};
const SENTIMENT: Record<string, string> = {
  positive: "bg-success/15 text-success",
  neutral: "bg-surface-2 text-muted",
  negative: "bg-danger/15 text-danger",
};

export function DialerView({ queue, locale }: { queue: CallQueueItem[]; locale?: string }) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  // Synchronous re-entry guard: placing a real call costs money and rings the
  // prospect, so a double-click must NEVER fire two calls. A ref blocks the second
  // click even within the same tick (before React re-renders the disabled button).
  const placingRef = useRef(false);
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);

  const active = queue[idx];
  const remaining = queue.filter((q) => !done[q.dealId]).length;
  // The next not-yet-completed call after the current one (−1 when none remain),
  // so "Next call" skips deals already wrapped up instead of landing back on them.
  const nextIdx = (() => {
    for (let i = idx + 1; i < queue.length; i++) if (!done[queue[i].dealId]) return i;
    return -1;
  })();

  function selectIndex(i: number) {
    setIdx(i);
    setBrief(null);
    setCallStatus(null);
    setNotes("");
    setSummary(null);
    setSaved(false);
    setSummaryError(null);
  }

  async function loadBrief() {
    if (!active) return;
    setBriefBusy(true);
    setBriefError(null);
    try {
      const res = await fetch("/api/ai/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId }) });
      if (!res.ok) throw new Error();
      setBrief(await res.json());
    } catch {
      // Don't fail silently — the rep clicks "Prepare" and otherwise sees nothing.
      setBriefError("Couldn't prepare the brief — try again.");
    } finally {
      setBriefBusy(false);
    }
  }

  async function call() {
    if (!active || placingRef.current) return; // never place a call twice on a double-click
    placingRef.current = true;
    setPlacing(true);
    setCallStatus("Dialing…");
    try {
      const res = await fetch("/api/calls/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId }) });
      const b = await res.json();
      if (!res.ok) setCallStatus(b.error ?? "Call failed");
      else setCallStatus(b.provider === "log" ? "Call logged — connect a phone number to dial for real" : `Dialing ${b.to}`);
    } catch {
      // Without this, a network blip leaves the status stuck on "Dialing…" forever.
      setCallStatus("Couldn't place the call — check your connection and try again.");
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }

  async function endCall() {
    if (!active) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/ai/call-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId, notes }) });
      if (!res.ok) {
        // Don't log a garbage "[undefined] undefined" activity or mark the call
        // done on a failed summary — surface the error and let the rep retry.
        const b = await res.json().catch(() => ({}));
        setSummaryError(b.error ?? "Couldn't summarize the call. Try again.");
        return;
      }
      const s: CallSummary = await res.json();
      setSummary(s);
      // Persist to the deal timeline.
      await fetch(`/api/opportunities/${active.dealId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "call", summary: `[${OUTCOME_LABEL[s.outcome] ?? s.outcome}] ${s.summary} — Next: ${s.nextStep}`, direction: "outbound" }),
      });
      setSaved(true);
      setDone((d) => ({ ...d, [active.dealId]: true }));
    } finally {
      setSummarizing(false);
    }
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        iconName="dialer"
        title="No calls queued"
        hint="The power dialer pulls deals with phone numbers from your Revenue Recall queue. When deals go cold, they line up here for back-to-back calling with AI prep."
        action={<Link href="/recall" className="cta inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90">View recall queue</Link>}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-fg">Call queue · {remaining} left</div>
        <div className="max-h-[70vh] flex-1 overflow-y-auto">
          {queue.map((q, i) => (
            <button
              key={q.dealId}
              onClick={() => selectIndex(i)}
              className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition hover:bg-surface-2 ${i === idx ? "bg-surface-2" : ""} ${done[q.dealId] ? "opacity-50" : ""}`}
            >
              <ScoreDot score={q.score} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{q.contactName}</div>
                <div className="truncate text-xs text-muted">{q.phone}</div>
              </div>
              {q.attempts > 0 && !done[q.dealId] && (
                <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted" title={`${q.attempts} prior call attempt${q.attempts === 1 ? "" : "s"}`}>
                  #{q.attempts + 1}
                </span>
              )}
              {done[q.dealId] && <Icon name="check" size={13} strokeWidth={3} className="text-success" />}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={active.contactName} size={44} />
                <div>
                  <Link href={`/deals/${active.dealId}`} className="font-semibold text-fg hover:underline">{active.contactName}</Link>
                  <div className="text-sm text-muted">{active.company || active.title}</div>
                  <div className="mt-1 font-mono text-sm text-fg">{active.phone}</div>
                </div>
              </div>
              <ReasonBadge reason={active.reason} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={call} disabled={placing} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] hover:bg-success/90 disabled:opacity-50 disabled:active:scale-100"><Icon name="dialer" size={15} /> {placing ? "Dialing…" : "Call"}</button>
              {callStatus && <span className="text-sm text-muted">{callStatus}</span>}
            </div>
          </div>

          <div className="card border-brand/30">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={16} className="text-brand" /> AI call prep</h2>
              <div className="flex items-center gap-2">
                {brief && <SpeakButton text={`${brief.summary} ${brief.talkingPoints.join(". ")}. Goal: ${brief.nextStep}`} label="Prep" />}
                <button onClick={loadBrief} disabled={briefBusy} className="text-xs text-brand hover:underline disabled:opacity-50">{briefBusy ? "Preparing…" : brief ? "Refresh" : "Prepare"}</button>
              </div>
            </div>
            {!brief ? (
              <p className={`text-sm ${briefError ? "text-danger" : "text-muted"}`}>{briefError ?? "Generate a talk track before you dial."}</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-fg">{brief.summary}</p>
                <ul className="space-y-1">
                  {brief.talkingPoints.map((p, i) => (
                    <li key={i} className="flex gap-2 text-muted"><span className="text-brand">•</span>{p}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted">Goal: {brief.nextStep}</p>
                {brief.voicemail && (
                  <div className="mt-2 rounded-lg border border-border bg-surface-2 p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-fg"><Icon name="dialer" size={12} className="text-brand" /> If it goes to voicemail</span>
                      <SpeakButton text={brief.voicemail} label="Play" />
                    </div>
                    <p className="text-sm italic text-muted">“{brief.voicemail}”</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <RolePlay contactName={active.contactName} company={active.company} dealTitle={active.title} locale={locale} />

          <div className="card">
            <h2 className="mb-2 font-semibold text-fg">Call notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Jot down what happened — AI will summarize, set the outcome, and log it."
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
            />
            {summaryError && <p className="mt-2 text-sm text-danger">{summaryError}</p>}
            <button onClick={endCall} disabled={summarizing} className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
              {summarizing ? "Summarizing…" : "End & summarize"}
            </button>

            {summary && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="pill bg-brand-soft text-brand">{OUTCOME_LABEL[summary.outcome] ?? summary.outcome}</span>
                  <span className={`pill ${SENTIMENT[summary.sentiment]}`}>{summary.sentiment}</span>
                  {saved && <span className="inline-flex items-center gap-1 text-xs text-success"><Icon name="check" size={12} strokeWidth={3} /> logged to timeline</span>}
                </div>
                <p className="text-sm text-fg">{summary.summary}</p>
                <p className="mt-1 text-xs text-muted">Next: {summary.nextStep}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => nextIdx >= 0 && selectIndex(nextIdx)} disabled={nextIdx < 0} className="rounded-lg border border-border px-4 py-2 text-sm text-fg transition hover:bg-surface-2 disabled:opacity-50">Next call →</button>
          </div>
        </div>
      )}
    </div>
  );
}
