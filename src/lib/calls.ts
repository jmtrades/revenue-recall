import { getProvider } from "@/lib/crm/registry";
import { planCallRetry, MAX_CALL_ATTEMPTS, type RetryPlan } from "@/lib/calls/retry";
import type { Activity } from "@/lib/crm/types";

/**
 * Call outcome logging. The in-house call-gateway POSTs a finished call's
 * outcome + transcript to /api/calls/log, which calls `logCallOutcome` so the
 * conversation lands on the CRM timeline instead of being lost. Pure and
 * provider-agnostic, so it's unit-testable against the built-in CRM.
 */

export interface CallLogInput {
  to?: string;
  contactId?: string;
  dealId?: string;
  /** Short outcome label, e.g. "completed", "no-answer", "voicemail", "booked". */
  outcome?: string;
  /** Full or summarized transcript of the call. */
  transcript?: string;
  durationSec?: number;
  recordingUrl?: string;
  occurredAt?: string;
}

/** Human-readable timeline summary for a logged call. */
export function callSummaryText(input: CallLogInput): string {
  const dur = typeof input.durationSec === "number" && input.durationSec > 0 ? ` (${Math.round(input.durationSec)}s)` : "";
  const head = `Call${input.outcome ? ` — ${input.outcome}` : ""}${dur}`;
  const parts = [head];
  if (input.transcript?.trim()) parts.push(input.transcript.trim());
  if (input.recordingUrl?.trim()) parts.push(`Recording: ${input.recordingUrl.trim()}`);
  return parts.join("\n\n");
}

/**
 * Persist the outcome of an outbound call to the CRM timeline. Best-effort:
 * needs a writable provider and at least one of contactId/dealId to attach to;
 * returns the created activity, or null if it couldn't be logged.
 */
export async function logCallOutcome(input: CallLogInput): Promise<Activity | null> {
  const provider = getProvider();
  if (!provider.info().capabilities.write) return null;
  if (!input.contactId && !input.dealId) return null;
  try {
    return await provider.logActivity({
      contactId: input.contactId,
      opportunityId: input.dealId,
      kind: "call",
      direction: "outbound",
      summary: callSummaryText(input),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

/**
 * After a call that didn't reach a human, schedule the next dial: count the
 * attempts so far, plan a retry (a different time-of-day window, capped), and
 * drop a task on the timeline so the rep/Autopilot re-calls at a better time.
 * Best-effort and org-scoped (runs inside the same runWithOrg the log does).
 * Returns the plan (or null when there's nothing to attach to / no provider).
 */
export async function scheduleCallRetry(input: { contactId?: string; dealId?: string; outcome?: string; now?: Date }): Promise<RetryPlan | null> {
  const provider = getProvider();
  if (!provider.info().capabilities.write) return null;
  const { contactId, dealId, outcome } = input;
  if (!contactId && !dealId) return null;

  // Count outbound call attempts so far (the just-logged call is included).
  let priorAttempts = 1;
  try {
    const acts = contactId && provider.listActivitiesByContact
      ? await provider.listActivitiesByContact(contactId)
      : dealId
        ? await provider.listActivities(dealId)
        : [];
    const n = acts.filter((a) => a.kind === "call" && a.direction === "outbound").length;
    if (n > 0) priorAttempts = n;
  } catch {
    /* best-effort — fall back to assuming this is the first attempt */
  }

  const plan = planCallRetry({ outcome, priorAttempts, now: input.now?.getTime() });
  if (!plan.retry) return plan;
  try {
    await provider.logActivity({
      contactId,
      opportunityId: dealId,
      kind: "task",
      summary: `Retry call — attempt ${plan.attempt} of ${MAX_CALL_ATTEMPTS}: no pickup last time, best window is the ${plan.window} (~${plan.waitHours}h).`,
      occurredAt: (input.now ?? new Date()).toISOString(),
    });
  } catch {
    /* never let scheduling a retry fail the call log */
  }
  return plan;
}
