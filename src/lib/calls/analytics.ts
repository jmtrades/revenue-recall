import type { Activity } from "@/lib/crm/types";
import { isRetryableOutcome, isVoicemailOutcome } from "@/lib/calls/retry";

/**
 * Call analytics — the reporting layer of the dial-volume story. The plans sell
 * ~100 dials/day, the power dialer makes it doable, the dashboard paces it;
 * this answers "is it WORKING": connect rate, talk time, and the day-by-day
 * trend, derived from the same outbound call activities everything else logs
 * (the dialer's "[No answer] …" one-taps, its "[Connected] …" summaries, and
 * the gateway's "Call — completed (123s)" posts). Pure over activities, so the
 * math is testable and provider-agnostic.
 */

export interface CallStats {
  dials: number;
  connects: number;
  voicemails: number;
  noAnswers: number;
  /** connects / dials, 0..1 (0 when no dials). */
  connectRate: number;
  /** Total connected talk time, minutes (1 decimal). */
  talkMinutes: number;
  /** Per local day, oldest → newest, exactly `days` entries (zero-filled). */
  perDay: { label: string; value: number }[];
}

/** The outcome text a call activity carries: "[Label] …" from the dialer, or
 *  "Call — outcome (12s)" from the gateway. Empty when unrecognizable. */
export function callOutcomeOf(summary: string): string {
  const bracket = summary.match(/^\[([^\]]{1,40})\]/);
  if (bracket) return bracket[1];
  const dash = summary.match(/^Call\s+—\s+([^\n(]{1,40})/);
  return dash ? dash[1].trim() : "";
}

/** Connected seconds embedded by the gateway as "(123s)". */
export function callSeconds(summary: string): number {
  const m = summary.match(/\((\d{1,6})s\)/);
  return m ? Number(m[1]) : 0;
}

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD local

/** Compute call stats over the trailing `days` window (default 7). */
export function callStats(activities: Activity[], days = 7, now: Date = new Date()): CallStats {
  const since = now.getTime() - days * DAY_MS;
  // Zero-filled day buckets so the chart always shows the full window.
  const buckets = new Map<string, number>();
  const perDay: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = dayKey(d);
    buckets.set(key, 0);
    perDay.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), value: 0 });
  }
  const keys = [...buckets.keys()];

  let dials = 0;
  let connects = 0;
  let voicemails = 0;
  let noAnswers = 0;
  let talkSeconds = 0;
  for (const a of activities) {
    if (a.kind !== "call" || a.direction !== "outbound" || !a.occurredAt) continue;
    const t = new Date(a.occurredAt).getTime();
    if (!(t > since)) continue;
    dials++;
    const key = dayKey(new Date(a.occurredAt));
    const idx = keys.indexOf(key);
    if (idx >= 0) perDay[idx].value++;
    const outcome = callOutcomeOf(a.summary ?? "");
    if (isVoicemailOutcome(outcome)) voicemails++;
    else if (isRetryableOutcome(outcome)) noAnswers++; // busy / no answer / missed
    else connects++; // connected, booked, callback set, not interested — they talked
    talkSeconds += callSeconds(a.summary ?? "");
  }

  return {
    dials,
    connects,
    voicemails,
    noAnswers,
    connectRate: dials > 0 ? connects / dials : 0,
    talkMinutes: Number((talkSeconds / 60).toFixed(1)),
    perDay,
  };
}
