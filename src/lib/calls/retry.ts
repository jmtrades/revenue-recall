/**
 * Call-retry strategy — what to do when a call doesn't reach a human.
 *
 * Most outbound calls hit voicemail or no-answer. Dropping those leads wastes
 * the pipeline; hammering the same time slot wastes dials. This decides whether
 * to try again, and rotates the time-of-day window (pickup rates differ a lot by
 * hour) with a growing backoff, capped so we never become a nuisance. Pure and
 * testable; a real decision (connected / booked / not interested) is terminal.
 */

export type CallWindow = "morning" | "midday" | "afternoon" | "evening";
export const CALL_WINDOWS: CallWindow[] = ["morning", "midday", "afternoon", "evening"];
/** Stop after this many attempts — beyond it, switch channel or let it rest. */
export const MAX_CALL_ATTEMPTS = 4;

/** Which window an hour-of-day (0–23) falls in. */
export function windowForHour(hour: number): CallWindow {
  if (hour < 11) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  return "evening";
}

/**
 * Worth another dial? Only when we didn't reach a person / get a decision —
 * no-answer, voicemail, busy, a machine. A connect, a booking, or a "no" is
 * terminal and must never be re-dialed.
 */
export function isRetryableOutcome(outcome: string | undefined): boolean {
  if (!outcome) return false;
  return /(no[\s_-]?answer|voicemail|\bvm\b|busy|missed|machine|no[\s_-]?pickup|unavailable|disconnected)/i.test(outcome);
}

/** Specifically a voicemail/answering-machine outcome (a subset of retryable) —
 *  the moment to drop a short follow-up text so they have an easy async reply. */
export function isVoicemailOutcome(outcome: string | undefined): boolean {
  if (!outcome) return false;
  return /(voicemail|\bvm\b|machine|left a message)/i.test(outcome);
}

export interface RetryPlan {
  retry: boolean;
  /** 1-based number of the attempt being scheduled. */
  attempt: number;
  /** Best window to try next (rotated off the last attempt). */
  window: CallWindow;
  /** Suggested backoff before the retry. */
  waitHours: number;
  note: string;
}

const BACKOFF_HOURS = [3, 24, 72]; // same day → next day → a few days

/**
 * Plan the next dial. `priorAttempts` is how many calls have been MADE so far
 * (including the one that just failed); the planner schedules attempt
 * priorAttempts+1 until the cap.
 */
export function planCallRetry(input: { outcome?: string; priorAttempts: number; lastHour?: number; now?: number }): RetryPlan {
  const made = Math.max(0, Math.floor(input.priorAttempts));
  const attempt = made + 1;
  if (!isRetryableOutcome(input.outcome) || made >= MAX_CALL_ATTEMPTS) {
    return { retry: false, attempt, window: "morning", waitHours: 0, note: !isRetryableOutcome(input.outcome) ? "Reached a decision — no retry." : "Hit the attempt cap — switch channel or rest it." };
  }
  const lastHour = input.lastHour ?? new Date(input.now ?? Date.now()).getHours();
  const lastWindow = windowForHour(lastHour);
  // Always land on a DIFFERENT window than the last dial: the step is 1..3, never
  // a multiple of 4, so repeated misses spread across the day — including on the
  // final retry (a plain `+ made` offset wraps back to the dead slot at made=3).
  const step = 1 + (made % (CALL_WINDOWS.length - 1));
  const next = CALL_WINDOWS[(CALL_WINDOWS.indexOf(lastWindow) + step) % CALL_WINDOWS.length];
  const waitHours = BACKOFF_HOURS[Math.min(made, BACKOFF_HOURS.length - 1)];
  return { retry: true, attempt, window: next, waitHours, note: `No pickup — retry #${attempt} in the ${next} (~${waitHours}h).` };
}
