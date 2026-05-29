"use client";

import { useState } from "react";
import Link from "next/link";
import type { CallQueueItem } from "@/lib/queries";
import { Icon } from "@/components/icons";
import { Avatar, ReasonBadge, ScoreDot } from "@/components/ui";
import { RolePlay } from "@/components/RolePlay";
import { SpeakButton } from "@/components/SpeakButton";

interface Brief {
  summary: string;
  nextStep: string;
  talkingPoints: string[];
  risk: string;
  source: string;
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
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saved, setSaved] = useState(false);

  const active = queue[idx];
  const remaining = queue.filter((q) => !done[q.dealId]).length;

  function selectIndex(i: number) {
    setIdx(i);
    setBrief(null);
    setCallStatus(null);
    setNotes("");
    setSummary(null);
    setSaved(false);
  }

  async function loadBrief() {
    if (!active) return;
    setBriefBusy(true);
    try {
      const res = await fetch("/api/ai/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId }) });
      if (res.ok) setBrief(await res.json());
    } finally {
      setBriefBusy(false);
    }
  }

  async function call() {
    if (!active) return;
    setCallStatus("Dialing…");
    const res = await fetch("/api/calls/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId }) });
    const b = await res.json();
    if (!res.ok) setCallStatus(b.error ?? "Call failed");
    else setCallStatus(b.provider === "log" ? "Call logged (connect Twilio to dial for real)" : `Dialing via ${b.provider} → ${b.to}`);
  }

  async function endCall() {
    if (!active) return;
    setSummarizing(true);
    try {
      const res = await fetch("/api/ai/call-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: active.dealId, notes }) });
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
    return <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted">No deals with phone numbers to call right now. The dialer pulls from your Revenue Recall queue.</div>;
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
              {done[q.dealId] && <span className="text-success">✓</span>}
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
              <button onClick={call} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] hover:bg-success/90"><Icon name="dialer" size={15} /> Call</button>
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
              <p className="text-sm text-muted">Generate a talk track before you dial.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-fg">{brief.summary}</p>
                <ul className="space-y-1">
                  {brief.talkingPoints.map((p, i) => (
                    <li key={i} className="flex gap-2 text-muted"><span className="text-brand">•</span>{p}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted">Goal: {brief.nextStep}</p>
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
            <button onClick={endCall} disabled={summarizing} className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
              {summarizing ? "Summarizing…" : "End & summarize"}
            </button>

            {summary && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="pill bg-brand-soft text-brand">{OUTCOME_LABEL[summary.outcome] ?? summary.outcome}</span>
                  <span className={`pill ${SENTIMENT[summary.sentiment]}`}>{summary.sentiment}</span>
                  {saved && <span className="text-xs text-success">✓ logged to timeline</span>}
                </div>
                <p className="text-sm text-fg">{summary.summary}</p>
                <p className="mt-1 text-xs text-muted">Next: {summary.nextStep}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => selectIndex(Math.min(queue.length - 1, idx + 1))} className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:bg-surface-2">Next call →</button>
          </div>
        </div>
      )}
    </div>
  );
}
