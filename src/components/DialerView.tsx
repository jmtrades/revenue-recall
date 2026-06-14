"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { CallQueueItem } from "@/lib/queries";
import { Icon } from "@/components/icons";
import { Avatar, ReasonBadge, ScoreDot, EmptyState } from "@/components/ui";
import { RolePlay } from "@/components/RolePlay";
import { SpeakButton } from "@/components/SpeakButton";
import { nextPendingIndex, QUICK_OUTCOMES, quickOutcome, dialerKeyAction, duplicatePhoneIndexes } from "@/lib/dialer-flow";
import { prospectLocalTime, outsideCourtesyWindow } from "@/lib/calls/local-time";

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

/** Minutes-left chip for the dialer header — green normally, amber under ~30
 *  min (≈10 calls), red and linking to billing at zero. The rep working calls
 *  back-to-back sees the balance fall in real-ish time (it refreshes on nav). */
function MinutesChip({ remainingMin, callsLeft }: { remainingMin: number; callsLeft: number }) {
  const out = remainingMin <= 0;
  const low = !out && remainingMin < 30;
  const cls = out ? "bg-danger/15 text-danger" : low ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted";
  const label = out ? "0 call min" : `${Math.round(remainingMin)} call min · ~${callsLeft} calls`;
  const chip = (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon name="dialer" size={12} />
      {label}
    </span>
  );
  // When out, the chip becomes the upgrade path — the rep can't dial, so point
  // them straight at billing instead of a dead status.
  return out ? <Link href="/settings?tab=billing" title="Out of call minutes — upgrade to keep dialing">{chip}</Link> : chip;
}

/** The prospect's wall-clock time next to their number — across timezones,
 *  "it's 5:40am for them" is the difference between a connect and an annoyed
 *  prospect. Amber outside the 8am–9pm courtesy window; hidden entirely when
 *  the zone can't be read off the number (non-NANP / toll-free). */
function LocalTimeChip({ phone }: { phone: string }) {
  // Re-render each minute so the clock stays honest during a long prep pause.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const lt = prospectLocalTime(phone);
  if (!lt) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lt.warn ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted"}`}
      title={lt.warn ? "Outside their local 8am–9pm calling window" : "Their local time"}
    >
      {lt.label} their time{lt.warn ? " · early/late" : ""}
    </span>
  );
}

/** Compact voice-minutes state for the dialer header (sanitized server-side).
 *  `metered` is false for unlimited plans and for orgs with no phone minutes
 *  (the chip only shows when there's a real balance to count down). */
export interface DialerVoiceMinutes {
  remainingMin: number;
  metered: boolean;
  callsLeft: number;
}

export function DialerView({ queue, locale, voiceMinutes }: { queue: CallQueueItem[]; locale?: string; voiceMinutes?: DialerVoiceMinutes }) {
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
  // The rep's outcome pick ("" = let AI infer from the notes). Overrides the AI
  // guess so a voicemail never gets logged as "Connected".
  const [outcome, setOutcome] = useState("");
  // Power Mode: after any logged outcome, jump straight to the next deal — the
  // difference between grinding out 100 dials a day and clicking "Next" 100
  // times. On by default; the rep can switch to one-at-a-time.
  const [powerMode, setPowerMode] = useState(true);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  const active = queue[idx];
  // Synced every render so in-flight requests can tell whether the rep has
  // moved on (see loadBrief's stale-response guard).
  const activeDealRef = useRef<string | undefined>(undefined);
  activeDealRef.current = active?.dealId;
  const remaining = queue.filter((q) => !done[q.dealId]).length;
  // The next not-yet-completed call after the current one (−1 when none remain),
  // so advancing skips deals already wrapped up instead of landing back on them.
  const nextIdx = nextPendingIndex(queue.length, (i) => Boolean(done[queue[i].dealId]), idx);
  // Same number under two lead rows (CSV imports do this constantly) — flag the
  // later one so the rep doesn't ring someone they hung up with minutes ago.
  const dupes = duplicatePhoneIndexes(queue);
  const activeDup = dupes.get(idx);

  function selectIndex(i: number) {
    setIdx(i);
    setBrief(null);
    setCallStatus(null);
    setNotes("");
    setSummary(null);
    setSaved(false);
    setSummaryError(null);
    setOutcome("");
  }

  async function loadBrief() {
    if (!active) return;
    // Guard against the stale-response race: the rep can hit N (next) while a
    // brief is in flight, and deal A's brief must never render under deal B.
    const dealId = active.dealId;
    setBriefBusy(true);
    setBriefError(null);
    try {
      const res = await fetch("/api/ai/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (activeDealRef.current === dealId) setBrief(data);
    } catch {
      // Don't fail silently — the rep clicks "Prepare" and otherwise sees nothing.
      if (activeDealRef.current === dealId) setBriefError("Couldn't prepare the brief — try again.");
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

  function advance() {
    // After an outcome: in Power Mode hop to the next pending deal; otherwise
    // stay put so the rep can review what they logged before moving on.
    if (powerMode && nextIdx >= 0) selectIndex(nextIdx);
  }

  // One-tap no-connect outcome — the ~85% case. Logs the deterministic outcome
  // directly (no AI summary, no minutes), marks the deal done, and advances.
  async function quickLog(o: { id: string; label: string; line: string }) {
    if (!active || quickBusy) return;
    setQuickBusy(o.id);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/opportunities/${active.dealId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "call", summary: o.line, direction: "outbound" }),
      });
      if (!res.ok) {
        setSummaryError("Couldn't log the outcome — try again.");
        return;
      }
      setDone((d) => ({ ...d, [active.dealId]: true }));
      setCallStatus(`Logged: ${o.label}`);
      advance();
    } catch {
      setSummaryError("Couldn't log the outcome — check your connection and try again.");
    } finally {
      setQuickBusy(null);
    }
  }

  async function endCall() {
    if (!active) return;
    // Require a note OR an explicit outcome — otherwise an empty call would log a
    // guessed outcome onto the timeline and skew the retry signal.
    if (!notes.trim() && !outcome) {
      setSummaryError("Add a note or pick an outcome before logging the call.");
      return;
    }
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/ai/call-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: active.dealId, notes, outcome: outcome || undefined }),
      });
      if (!res.ok) {
        // Don't log a garbage "[undefined] undefined" activity or mark the call
        // done on a failed summary — surface the error and let the rep retry.
        const b = await res.json().catch(() => ({}));
        setSummaryError(b.error ?? "Couldn't summarize the call. Try again.");
        return;
      }
      const s: CallSummary = await res.json();
      // The rep's explicit pick always wins over whatever the summary inferred.
      const finalOutcome = outcome || s.outcome;
      // Persist to the deal timeline — and surface a failure instead of falsely
      // showing "logged to timeline" when the write didn't land.
      const logRes = await fetch(`/api/opportunities/${active.dealId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "call", summary: `[${OUTCOME_LABEL[finalOutcome] ?? finalOutcome}] ${s.summary} — Next: ${s.nextStep}`, direction: "outbound" }),
      });
      if (!logRes.ok) {
        setSummaryError("Summarized, but couldn't log it to the timeline — try again.");
        return;
      }
      setSummary({ ...s, outcome: finalOutcome });
      setSaved(true);
      setDone((d) => ({ ...d, [active.dealId]: true }));
      // A connected call is fully logged — in Power Mode roll to the next deal
      // after a beat so the rep can glance at the summary that just saved.
      if (powerMode && nextIdx >= 0) setTimeout(advance, 900);
    } catch {
      setSummaryError("Couldn't save the call. Check your connection and try again.");
    } finally {
      setSummarizing(false);
    }
  }

  // Keyboard-driven dialing: C call · 1/2/3 no-answer/voicemail/busy · N next.
  // Routing logic lives in dialerKeyAction (pure, tested): never fires while
  // typing in the notes/select, never eats modified chords, no-ops while a
  // call/outcome is in flight or the deal is already done.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
      const action = dialerKeyAction(e.key, { typing, modifier: e.metaKey || e.ctrlKey || e.altKey });
      if (!action) return;
      e.preventDefault();
      if (action.kind === "call" && !placing && active && !done[active.dealId]) void call();
      else if (action.kind === "quick" && !quickBusy && active && !done[active.dealId]) {
        const o = quickOutcome(action.outcomeId);
        if (o) void quickLog(o);
      } else if (action.kind === "next" && nextIdx >= 0) selectIndex(nextIdx);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm font-medium text-fg">
          <span>Call queue · {remaining} left</span>
          {voiceMinutes?.metered && <MinutesChip remainingMin={voiceMinutes.remainingMin} callsLeft={voiceMinutes.callsLeft} />}
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-border/60 bg-surface-2/40 px-4 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted"><Icon name="autopilot" size={12} className="text-brand" /> Power Mode — auto-advance after each call</span>
          <button
            type="button"
            role="switch"
            aria-checked={powerMode}
            onClick={() => setPowerMode((v) => !v)}
            className={`relative h-4 w-7 shrink-0 rounded-full transition ${powerMode ? "bg-brand" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${powerMode ? "left-3.5" : "left-0.5"}`} />
          </button>
        </label>
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
              {!done[q.dealId] && outsideCourtesyWindow(q.phone) && (
                <span className="shrink-0 text-[11px]" title="Outside their local 8am–9pm calling window" aria-label="Outside their local calling hours">
                  🌙
                </span>
              )}
              {dupes.has(i) && (
                <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn" title={`Same number as ${dupes.get(i)!.firstName} (#${dupes.get(i)!.firstIndex + 1} in this queue)`}>
                  dup
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
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-fg">{active.phone}</span>
                    <LocalTimeChip phone={active.phone} />
                  </div>
                  {activeDup && (
                    <p className="mt-1 text-xs text-warn">
                      Same number as {activeDup.firstName} (#{activeDup.firstIndex + 1} in this queue) — likely a duplicate lead row.
                    </p>
                  )}
                </div>
              </div>
              <ReasonBadge reason={active.reason} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={call} disabled={placing} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] hover:bg-success/90 disabled:opacity-50 disabled:active:scale-100"><Icon name="dialer" size={15} /> {placing ? "Dialing…" : "Call"}</button>
              {/* role=status announces dial outcomes (incl. the TCPA window
                  message) to screen readers without stealing focus. */}
              {callStatus && <span role="status" aria-live="polite" className="text-sm text-muted">{callStatus}</span>}
            </div>
            {/* One-tap no-connect logging — the bulk of any dial day. Each logs
                the outcome, re-queues the deal, and (in Power Mode) jumps to the
                next, so a missed call is a single click, not the full notes flow. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="text-xs text-muted">Didn&apos;t connect?</span>
              {QUICK_OUTCOMES.map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => quickLog(o)}
                  disabled={Boolean(quickBusy) || Boolean(done[active.dealId])}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg transition hover:bg-surface-2 disabled:opacity-50"
                >
                  {quickBusy === o.id ? "Logging…" : o.label}
                  <kbd className="ml-1.5 rounded bg-surface-2 px-1 font-mono text-[10px] text-muted">{i + 1}</kbd>
                </button>
              ))}
              <span className="ml-auto hidden text-[11px] text-muted/70 sm:block">
                <kbd className="rounded bg-surface-2 px-1 font-mono text-[10px]">C</kbd> call · <kbd className="rounded bg-surface-2 px-1 font-mono text-[10px]">N</kbd> next
              </span>
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
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="call-outcome" className="text-xs text-muted">Outcome</label>
              <select
                id="call-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-brand"
              >
                <option value="">Auto-detect from notes</option>
                {Object.entries(OUTCOME_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
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
