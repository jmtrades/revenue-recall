/**
 * Power-dialer flow helpers — the pure logic behind "100 dials a day". Kept out
 * of the component so it's unit-testable (the UI has no render-test harness):
 * the queue-advance rule and the one-tap no-connect outcomes that let a rep
 * clear the ~85% of dials nobody picks up without typing a note or spending an
 * AI summary on each.
 */

/** The next not-yet-done index after `from` (−1 when none remain). Skips
 *  already-wrapped deals so auto-advance never lands back on a finished call. */
export function nextPendingIndex(length: number, isDone: (i: number) => boolean, from: number): number {
  for (let i = from + 1; i < length; i++) if (!isDone(i)) return i;
  return -1;
}

export interface QuickOutcome {
  id: string;
  label: string;
  /** The activity summary logged for a one-tap outcome — no AI summary needed
   *  (there's nothing said to summarize) and no talk minutes burned. The text
   *  carries the label the retry scheduler matches on (no-answer/voicemail/busy
   *  are all retryable), so a missed dial still gets re-queued automatically. */
  line: string;
}

/** The no-connect outcomes a rep taps to log-and-advance in one click. These
 *  are the bulk of any real dial day; making them a single tap is the whole
 *  point of the power dialer. */
export const QUICK_OUTCOMES: QuickOutcome[] = [
  { id: "no_answer", label: "No answer", line: "[No answer] No pickup — re-queued for another attempt." },
  { id: "voicemail", label: "Voicemail", line: "[Voicemail] Left a voicemail — re-queued to follow up." },
  { id: "busy", label: "Busy", line: "[Busy] Line busy — re-queued for another attempt." },
];

export function quickOutcome(id: string): QuickOutcome | undefined {
  return QUICK_OUTCOMES.find((o) => o.id === id);
}
