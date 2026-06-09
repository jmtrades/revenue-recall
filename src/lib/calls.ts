import { resolveProvider } from "@/lib/crm/registry";
import { planCallRetry, isVoicemailOutcome, MAX_CALL_ATTEMPTS, type RetryPlan } from "@/lib/calls/retry";
import { hasOptedOut, quietHoursNow } from "@/lib/agent/guardrails";
import { listTasks } from "@/lib/agent/store";
import { isEntitled } from "@/lib/billing/enforce";
import { getOrgSettings } from "@/lib/org";
import { placeCall } from "@/lib/comms";
import { voicemailFollowupText } from "@/lib/voice/voicemail";
import { createOutboxItem, listOutbox } from "@/lib/agent/store";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";

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
  const provider = (await resolveProvider());
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
  const provider = (await resolveProvider());
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
      // The "(due …)" tail is a machine marker runCallRetries() parses to
      // actually execute this retry — keep it in sync with parseRetryTask.
      summary: `Retry call — attempt ${plan.attempt} of ${MAX_CALL_ATTEMPTS}: no pickup last time, best window is the ${plan.window} (~${plan.waitHours}h). (due ${new Date((input.now ?? new Date()).getTime() + plan.waitHours * 3_600_000).toISOString()})`,
      occurredAt: (input.now ?? new Date()).toISOString(),
    });
  } catch {
    /* never let scheduling a retry fail the call log */
  }
  return plan;
}

export type FollowupSkip = "not_voicemail" | "read_only" | "no_target" | "no_contact" | "no_phone" | "opted_out" | "recently_texted" | "already_queued" | "error";

/**
 * After a call goes to voicemail, queue a short follow-up TEXT to Approvals — so
 * the prospect has an easy async reply path (a text back beats a call back, and
 * pairing a voicemail with a text lifts response rates). Safe by default: it
 * QUEUES for review, never auto-sends from this machine webhook. Skips when the
 * contact opted out, has no mobile, or was already texted recently / has a
 * follow-up waiting — so retries that keep hitting voicemail never stack texts.
 * Best-effort and guaranteed non-throwing (it must not break the idempotent
 * call-log it runs inside). Returns {queued} with a skip reason.
 */
export async function scheduleVoicemailFollowup(input: { contactId?: string; dealId?: string; outcome?: string; now?: Date }): Promise<{ queued: boolean; reason?: FollowupSkip }> {
  try {
    if (!isVoicemailOutcome(input.outcome)) return { queued: false, reason: "not_voicemail" };
    const provider = (await resolveProvider());
    if (!provider.info().capabilities.write) return { queued: false, reason: "read_only" };
    const { contactId, dealId } = input;
    if (!contactId && !dealId) return { queued: false, reason: "no_target" };

    // Resolve the deal (for opt-out tags + the subject) and the contact (mobile, name).
    const opp: Opportunity | undefined = dealId ? (await provider.getOpportunity(dealId).catch(() => null)) ?? undefined : undefined;
    let contact: Contact | undefined = contactId ? (await provider.getContact(contactId).catch(() => null)) ?? undefined : undefined;
    if (!contact && opp) contact = (await provider.getContact(opp.contactId).catch(() => null)) ?? undefined;
    if (!contact) return { queued: false, reason: "no_contact" };
    const phone = contact.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value;
    if (!phone) return { queued: false, reason: "no_phone" };

    let activities: Activity[] = [];
    try {
      activities = contactId && provider.listActivitiesByContact ? await provider.listActivitiesByContact(contactId) : dealId ? await provider.listActivities(dealId) : [];
    } catch {
      /* best-effort — opt-out attribute/tags below still apply */
    }
    // Never text someone who opted out (TCPA/CTIA) — same gate as every other send.
    if (hasOptedOut(contact, opp, activities)) return { queued: false, reason: "opted_out" };

    // Anti-stacking: don't pile on if we texted them in the last 24h or one's queued.
    const since = (input.now?.getTime() ?? Date.now()) - 86_400_000;
    if (activities.some((a) => a.kind === "sms" && a.direction === "outbound" && new Date(a.occurredAt).getTime() >= since)) {
      return { queued: false, reason: "recently_texted" };
    }
    const pending = await listOutbox("pending").catch(() => []);
    if (pending.some((o) => o.channel === "sms" && o.contactId === contact!.id)) return { queued: false, reason: "already_queued" };

    const body = voicemailFollowupText({ contactName: contact.name, dealTitle: opp?.title, seed: dealId || contactId });
    await createOutboxItem({ dealId, contactId: contact.id, channel: "sms", body, source: "template" });
    return { queued: true };
  } catch {
    return { queued: false, reason: "error" }; // must never break the call log
  }
}

// ---- autonomous retry execution ----

/** Parse the machine tail scheduleCallRetry writes. Pure (unit-tested). */
export function parseRetryTask(summary: string): { attempt: number; dueAt: string } | null {
  const m = /^Retry call — attempt (\d+) of \d+.*\(due ([0-9TZ:.\-]+)\)\s*$/.exec(summary ?? "");
  if (!m) return null;
  const dueAt = new Date(m[2]);
  if (Number.isNaN(dueAt.getTime())) return null;
  return { attempt: Number(m[1]), dueAt: dueAt.toISOString() };
}

export interface RetryRunResult {
  due: number;
  placed: number;
  skipped: number;
}

/** Per-run safety cap on autonomous redials — backstop on top of the per-contact
 *  attempt budget, so one tick can never burst-dial a whole list. */
const MAX_RETRIES_PER_RUN = 10;

/**
 * Execute due call retries — the half that was missing: scheduleCallRetry
 * planned the redial (window + backoff) but only wrote a timeline note, so the
 * autonomous loop ended after attempt 1. The hourly cron now places due retries
 * through the same comms gateway, but ONLY when the org has opted into
 * autonomous calling: an enabled autopilot task on the call channel running in
 * "auto" mode, plus the autopilot entitlement — mirroring the agent engine's
 * rule. Quiet hours, opt-outs, and the per-contact attempt budget all apply;
 * a retry consumed by ANY later outbound call (autonomous or a rep dialing) is
 * skipped. Best-effort: never throws into the cron.
 */
export async function runCallRetries(now: Date = new Date()): Promise<RetryRunResult> {
  const result: RetryRunResult = { due: 0, placed: 0, skipped: 0 };
  try {
    const tasks = await listTasks();
    const wantsAuto = tasks.some((t) => t.enabled && t.channel === "call" && t.autonomy === "auto");
    if (!wantsAuto || !(await isEntitled("autopilot"))) return result;
    const org = await getOrgSettings();
    if (quietHoursNow(now, org.timezone)) return result;

    const provider = await resolveProvider();
    if (!provider.info().capabilities.write) return result;
    const [recent, contacts] = await Promise.all([provider.listRecentActivities(500), provider.listContacts()]);
    const cById = new Map(contacts.map((c) => [c.id, c]));
    const actsByContact = new Map<string, Activity[]>();
    for (const a of recent) {
      if (!a.contactId) continue;
      const list = actsByContact.get(a.contactId);
      if (list) list.push(a);
      else actsByContact.set(a.contactId, [a]);
    }

    const handled = new Set<string>(); // newest retry task per contact wins
    for (const a of recent) {
      if (a.kind !== "task" || !a.contactId || handled.has(a.contactId)) continue;
      const plan = parseRetryTask(a.summary);
      if (!plan) continue;
      handled.add(a.contactId);
      if (new Date(plan.dueAt).getTime() > now.getTime()) continue; // not due yet
      result.due += 1;

      const acts = actsByContact.get(a.contactId) ?? [];
      // Already consumed: any outbound call AFTER the retry was scheduled —
      // whether this runner placed it or a rep dialed from the power dialer.
      if (acts.some((x) => x.kind === "call" && x.direction === "outbound" && x.occurredAt > a.occurredAt)) {
        result.skipped += 1;
        continue;
      }
      const contact = cById.get(a.contactId);
      const phone = contact?.points.find((p) => p.channel === "phone")?.value;
      const attempts = acts.filter((x) => x.kind === "call" && x.direction === "outbound").length;
      if (!contact || !phone || attempts >= MAX_CALL_ATTEMPTS || hasOptedOut(contact, undefined, acts)) {
        result.skipped += 1;
        continue;
      }
      if (result.placed >= MAX_RETRIES_PER_RUN) break;

      const res = await placeCall(phone, {
        from: org.callerId,
        meta: { contactId: contact.id, ...(a.opportunityId ? { dealId: a.opportunityId } : {}) },
      }).catch(() => ({ status: "failed" as const }));
      if (res.status === "failed") {
        result.skipped += 1;
        continue;
      }
      result.placed += 1;
      await provider
        .logActivity({
          contactId: contact.id,
          opportunityId: a.opportunityId,
          kind: "call",
          summary: `Autopilot retry call placed (attempt ${attempts + 1} of ${MAX_CALL_ATTEMPTS}).`,
          direction: "outbound",
          occurredAt: now.toISOString(),
        })
        .catch(() => {});
    }
  } catch {
    /* best-effort — the cron tick must never fail on retries */
  }
  return result;
}
