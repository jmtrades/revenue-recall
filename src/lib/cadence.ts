import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { resolveProvider } from "@/lib/crm/registry";
import { isEmailBounced } from "@/lib/bounce";
import { getOrgSettings } from "@/lib/org";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { getActiveVoice } from "@/lib/voice";
import { getIndustry, recallThresholdsFor } from "@/lib/industries";
import { contactPreferredLanguage } from "@/lib/languages";
import { buildRecallQueue, scoreOpportunity, type RecallThresholds } from "@/lib/recall/engine";
import { draftMessage } from "@/lib/ai/draft";
import { isAiConfigured } from "@/lib/ai/client";
import { enforcementOn, isEntitled } from "@/lib/billing/enforce";
import { isWithinActionAllowance } from "@/lib/ai/usage";
import { sendEmail, sendSms } from "@/lib/comms";
import { createOutboxItem } from "@/lib/agent/store";
import { hasOptedOut, quietHoursNow } from "@/lib/agent/guardrails";
import { batchActivities } from "@/lib/crm/activities";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { getSequence } from "@/lib/sequences";
import { recordRecallTouch } from "@/lib/recall/events";
import { submitDraftBatch, collectBatch, listPendingBatches, markBatchCollected, type BatchDraftRequest } from "@/lib/ai/batch";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";

/**
 * Cadence runtime. Sequences used to be static, decorative definitions — this
 * turns them into a real engine: a contact/deal is *enrolled*, and a scheduler
 * (the same cron that runs Autopilot) advances each enrollment through its steps
 * on schedule, drafting in the rep's voice and either queuing to Approvals or
 * auto-sending (SEQUENCE_AUTOPILOT=true). Closed-won/lost deals stop the cadence
 * automatically so nobody keeps nudging a done deal.
 *
 * Uses Supabase when configured (org-scoped), else an in-memory store so the
 * demo works with zero setup. Enrollment ids reference provider-level contact/
 * deal ids and are stored as text, so this works with any CRM backend.
 */

export type EnrollmentStatus = "active" | "completed" | "stopped";

export interface Enrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  dealId?: string;
  /** Index of the next step to run. */
  stepIndex: number;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** When the current step becomes due. */
  nextDueAt: string;
  lastStepAt?: string;
}

export interface EnrollResult {
  enrolled: number;
  skipped: number;
  enrollments: Enrollment[];
}

export interface CadenceTickResult {
  due: number;
  processed: number;
  sent: number;
  queued: number;
  completed: number;
  stopped: number;
  /** Steps advanced without a touch because the contact was unreachable on that channel. */
  skipped: number;
  /** Drafts deferred to an async batch (SEQUENCE_BATCH); collected on a later tick. */
  batched: number;
}

/** The address to reach a contact on a given channel (email vs phone), if any.
 *  A hard-bounced email is treated as unreachable so the cadence skips email for
 *  that contact (and naturally falls through to the next due step / channel). */
export function addressFor(contact: Contact | undefined, channel: "email" | "sms" | "call"): string | undefined {
  if (!contact) return undefined;
  if (channel === "email") return isEmailBounced(contact) ? undefined : contact.points.find((p) => p.channel === "email")?.value;
  return contact.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

async function orgId(): Promise<string> {
  const id = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!id) throw new Error("No active org");
  return id;
}

// ---- in-memory fallback (demo) ----
const memEnrollments: Enrollment[] = [];

/** Test-only: clear in-memory enrollments so suites don't leak state. */
export function __resetEnrollmentsForTests(): void {
  memEnrollments.length = 0;
}

function mapEnrollment(r: Record<string, unknown>): Enrollment {
  return {
    id: r.id as string,
    sequenceId: r.sequence_id as string,
    contactId: r.contact_id as string,
    dealId: (r.deal_id as string) ?? undefined,
    stepIndex: Number(r.step_index ?? 0),
    status: r.status as EnrollmentStatus,
    enrolledAt: r.enrolled_at as string,
    nextDueAt: r.next_due_at as string,
    lastStepAt: (r.last_step_at as string) ?? undefined,
  };
}

async function listActiveEnrollments(): Promise<Enrollment[]> {
  if (!isSupabaseConfigured()) return memEnrollments.filter((e) => e.status === "active");
  const client = getSupabase()!;
  const { data, error } = await client
    .from("sequence_enrollments")
    .select("*")
    .eq("org_id", await orgId())
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEnrollment);
}

export async function listEnrollments(status?: EnrollmentStatus, limit = 200): Promise<Enrollment[]> {
  if (!isSupabaseConfigured()) {
    const all = status ? memEnrollments.filter((e) => e.status === status) : memEnrollments;
    return all.slice(0, limit);
  }
  const client = getSupabase()!;
  let q = client.from("sequence_enrollments").select("*").eq("org_id", await orgId());
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("enrolled_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEnrollment);
}

async function insertEnrollment(e: Omit<Enrollment, "id">): Promise<Enrollment> {
  if (!isSupabaseConfigured()) {
    const row: Enrollment = { ...e, id: `se_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    memEnrollments.unshift(row);
    return row;
  }
  const client = getSupabase()!;
  const { data, error } = await client
    .from("sequence_enrollments")
    .insert({
      org_id: await orgId(),
      sequence_id: e.sequenceId,
      contact_id: e.contactId,
      deal_id: e.dealId ?? null,
      step_index: e.stepIndex,
      status: e.status,
      enrolled_at: e.enrolledAt,
      next_due_at: e.nextDueAt,
      last_step_at: e.lastStepAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEnrollment(data);
}

async function updateEnrollment(id: string, patch: Partial<Enrollment>): Promise<void> {
  if (!isSupabaseConfigured()) {
    const e = memEnrollments.find((x) => x.id === id);
    if (e) Object.assign(e, patch);
    return;
  }
  const update: Record<string, unknown> = {};
  if (patch.stepIndex !== undefined) update.step_index = patch.stepIndex;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.nextDueAt !== undefined) update.next_due_at = patch.nextDueAt;
  if (patch.lastStepAt !== undefined) update.last_step_at = patch.lastStepAt;
  await getSupabase()!.from("sequence_enrollments").update(update).eq("org_id", await orgId()).eq("id", id);
}

export async function stopEnrollment(id: string): Promise<void> {
  await updateEnrollment(id, { status: "stopped" });
}

/**
 * A real reply ends the cadence — the deal page promises "each step sends on
 * its day until they reply or close", and continuing to drip day-3/day-7 steps
 * at someone mid-conversation is how outbound tools get marked as spam. Called
 * from every inbound path (email/SMS webhook + social DM ingest) when the
 * sender matched a contact. Best-effort and never throws: logging the inbound
 * must succeed even if the enrollment store hiccups.
 */
export async function stopEnrollmentsForContact(contactId: string): Promise<number> {
  if (!contactId) return 0;
  try {
    const active = await listEnrollments("active");
    const mine = active.filter((e) => e.contactId === contactId);
    for (const e of mine) await stopEnrollment(e.id);
    return mine.length;
  } catch {
    return 0;
  }
}

// ---- enrollment ----

interface Target {
  opp?: Opportunity;
  contactId: string;
}

function resolveTargets(scope: string, pipelines: Pipeline[], opps: Opportunity[], thresholds?: RecallThresholds): Target[] {
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const MAX = 50;
  if (scope === "recall_queue") {
    return buildRecallQueue(opps, pipelines, undefined, thresholds)
      .slice(0, MAX)
      .map((r) => opps.find((o) => o.id === r.opportunityId))
      .filter((o): o is Opportunity => Boolean(o))
      .map((opp) => ({ opp, contactId: opp.contactId }));
  }
  if (scope === "all_open") {
    return opps.filter((o) => stageById.get(o.stageId)?.type === "open").slice(0, MAX).map((opp) => ({ opp, contactId: opp.contactId }));
  }
  if (scope.startsWith("deal:")) {
    const opp = opps.find((o) => o.id === scope.slice(5));
    return opp ? [{ opp, contactId: opp.contactId }] : [];
  }
  if (scope.startsWith("contacts:")) {
    // Bulk: a comma-separated list of contact ids (e.g. the Leads table's
    // selection). Capped at MAX like every other scope.
    const ids = scope.slice(9).split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX);
    return ids.map((contactId) => ({ contactId }));
  }
  if (scope.startsWith("contact:")) {
    return [{ contactId: scope.slice(8) }];
  }
  return [];
}

/**
 * Enroll one or many deals/contacts into a sequence. `scope` accepts the same
 * vocabulary as Autopilot (recall_queue | all_open | deal:<id> | contact:<id> |
 * contacts:<id,id,…>). Skips anyone already actively enrolled in this sequence.
 */
export async function enroll(sequenceId: string, scope: string): Promise<EnrollResult> {
  const seq = getSequence(sequenceId);
  if (!seq) throw new Error(`Unknown sequence: ${sequenceId}`);
  if (seq.steps.length === 0) throw new Error("Sequence has no steps");

  const provider = (await resolveProvider());
  const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const thresholds = recallThresholdsFor((await getOrgSettings()).industryId);
  const targets = resolveTargets(scope, pipelines, opps, thresholds);

  const active = await listActiveEnrollments();
  const already = new Set(active.filter((e) => e.sequenceId === sequenceId).map((e) => e.dealId ?? e.contactId));

  const now = new Date().toISOString();
  const enrollments: Enrollment[] = [];
  let skipped = 0;
  for (const t of targets) {
    const key = t.opp?.id ?? t.contactId;
    if (already.has(key)) {
      skipped += 1;
      continue;
    }
    enrollments.push(
      await insertEnrollment({
        sequenceId,
        contactId: t.contactId,
        dealId: t.opp?.id,
        stepIndex: 0,
        status: "active",
        enrolledAt: now,
        nextDueAt: addDays(now, seq.steps[0].day),
      }),
    );
  }
  return { enrolled: enrollments.length, skipped, enrollments };
}

// ---- the engine ----

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/**
 * Advance every enrollment whose current step is due. Drafts in the rep's voice
 * and queues to Approvals (default) or auto-sends when SEQUENCE_AUTOPILOT=true.
 * `now` is injectable for testing. Safe to call repeatedly (idempotent per due
 * window): each call moves a given enrollment forward at most one step.
 */
export async function runDueSteps(now: string = new Date().toISOString()): Promise<CadenceTickResult> {
  const provider = (await resolveProvider());
  const [pipelines, opps, contacts, org, voice] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    getOrgSettings(),
    getActiveVoice(),
  ]);
  const industry = getIndustry(org.industryId);
  const recallThresholds = recallThresholdsFor(org.industryId);
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const contactById = new Map<string, Contact>(contacts.map((c) => [c.id, c]));
  const oppById = new Map<string, Opportunity>(opps.map((o) => [o.id, o]));
  const autoSend = process.env.SEQUENCE_AUTOPILOT === "true";
  // Opt-in: defer drafts to the Anthropic Batches API (~50% cheaper, async).
  // Batched drafts are always queued to Approvals on collect — never auto-sent —
  // since opt-out/quiet-hours were evaluated at submit time, not collect time.
  // Batch is a CHEAPER way to spend the same monthly action pool, not a way
  // around it — so when the pool is exhausted, fall back to the synchronous draft
  // path (which template-falls-back under enforcement), exactly like a sync draft.
  // Batch is gated like every live-AI path: plans without the aiLive
  // entitlement fall through to the synchronous draft (which template-falls-back
  // under enforcement) instead of getting live batch drafting for free.
  const batchMode = process.env.SEQUENCE_BATCH === "true" && isAiConfigured() && (await isEntitled("aiLive")) && (!enforcementOn() || (await isWithinActionAllowance()));
  const batchRequests: BatchDraftRequest[] = [];

  // Serialize cadence sending per org: two overlapping cron runs (a scheduled
  // tick plus a manual trigger, or a run that exceeds the interval) must not both
  // send the same step to a prospect. If another run holds the lock, this one
  // yields — it'll catch any still-due steps on the next tick.
  const lockKey = `cadence:${org.id ?? "default"}`;
  const lockFence = await acquireCronLock(lockKey);
  if (!lockFence) {
    return { due: 0, processed: 0, sent: 0, queued: 0, completed: 0, stopped: 0, skipped: 0, batched: 0 };
  }
  try {
    const active = await listActiveEnrollments();
  const due = active.filter((e) => e.nextDueAt <= now);
  // Prefetch activities for every due deal in one batch (avoids N+1 opt-out lookups).
  const actByOpp = await batchActivities(provider, due.map((e) => e.dealId).filter((id): id is string => Boolean(id)));

  const result: CadenceTickResult = { due: due.length, processed: 0, sent: 0, queued: 0, completed: 0, stopped: 0, skipped: 0, batched: 0 };

  for (const e of due) {
    const seq = getSequence(e.sequenceId);
    if (!seq || e.stepIndex >= seq.steps.length) {
      await updateEnrollment(e.id, { status: "completed" });
      result.completed += 1;
      continue;
    }
    const deal = e.dealId ? oppById.get(e.dealId) : undefined;
    const contact = contactById.get(e.contactId);

    // Stop selling to a deal that's already closed-won. (Closed-lost deals are
    // intentionally left in re-engagement cadences — winning them back is the
    // whole point of Revenue Recall.)
    if (deal && stageById.get(deal.stageId)?.type === "won") {
      await updateEnrollment(e.id, { status: "stopped" });
      result.stopped += 1;
      continue;
    }

    // Honor opt-outs: stop the cadence for anyone who unsubscribed or asked us to
    // stop. (A soft "not now" is left enrolled — re-engagement is the point.)
    // For a contact-scoped enrollment (no deal) the prefetched per-deal activities
    // don't apply, so load the contact's own activities — otherwise an opt-out that
    // lives only in activity history (e.g. on a provider that can't persist the
    // do-not-contact attribute) would be missed and the cadence would keep sending.
    let optOutActs = deal ? actByOpp.get(deal.id) ?? [] : [];
    if (!deal && provider.listActivitiesByContact) {
      optOutActs = await provider.listActivitiesByContact(e.contactId).catch(() => []);
    }
    if (hasOptedOut(contact, deal, optOutActs)) {
      await updateEnrollment(e.id, { status: "stopped" });
      result.stopped += 1;
      continue;
    }

    const step = seq.steps[e.stepIndex];
    const name = contact?.name ?? deal?.title ?? "there";
    const stageLabel = deal ? stageById.get(deal.stageId)?.label ?? "open" : "open";
    const address = addressFor(contact, step.channel);

    if (!address) {
      // No way to reach them on this channel (e.g. a call/SMS step with no phone
      // on file) — skip the step rather than burn an AI draft or queue a
      // dead-end message. Advance so the enrollment doesn't get stuck.
      result.skipped += 1;
    } else if (step.channel === "call") {
      // Calls can't be auto-dialed from a cadence — drop a task on the timeline.
      await provider.logActivity({
        opportunityId: deal?.id,
        contactId: e.contactId,
        kind: "task",
        summary: `Cadence call — ${seq.name}: ${step.subject}. ${step.body}`,
        occurredAt: now,
      });
      // The dropped task IS the cadence's outreach action for a call step (there's
      // no auto-dial, and no later approve→send hook), so attribute it now.
      if (seq.id === "recall") await recordRecallTouch({ dealId: deal?.id, contactId: e.contactId, channel: "call", source: "cadence", occurredAt: now });
    } else {
      // Pass the deal's ACTUAL recall reason (no_show / going_cold / stalled / …)
      // so the draft re-opens it the right way — a no-show gets "we missed each
      // other, grab another time", not the same nudge as a long-dormant cold deal.
      // Falls back to a generic re-engagement reason when the deal doesn't
      // currently score as slipping (e.g. it was recently re-touched).
      const recallReason =
        seq.id === "recall"
          ? (deal ? scoreOpportunity(deal, stageById, { activities: optOutActs }, recallThresholds)?.reason : undefined) ?? "lost_winnable"
          : undefined;
      // A no-show wants a reschedule, not a generic nudge: when this step hasn't
      // declared its own scenario (e.g. the breakup last step), use the tuned
      // "reschedule" copy/coaching for a ghosted-after-meeting deal.
      const scenario = step.scenario ?? (recallReason === "no_show" ? "reschedule" : undefined);
      const draftInput = {
        channel: step.channel,
        contactName: name,
        company: contact?.company,
        dealTitle: deal?.title ?? name,
        valueLabel: industry.terminology.value,
        value: deal?.value ?? 0,
        currency: deal?.currency ?? org.currency,
        stageLabel,
        industryLabel: industry.label,
        industryId: industry.id,
        recallReason,
        daysSinceContact: daysSince(deal?.lastActivityAt),
        // A step can mark itself a special type — e.g. a gracious "breakup" as the
        // final recall touch — and a no-show defaults to "reschedule" (above).
        // Default steps with no scenario stay normal follow-ups.
        scenario,
        instruction: `This is step ${e.stepIndex + 1} of the "${seq.name}" cadence. Intent: ${step.body}`,
        language: contactPreferredLanguage(contact?.attributes, org.language),
        voice,
      } as const;

      if (batchMode) {
        // Defer the draft to the async batch; it'll be queued to Approvals when
        // the batch is collected on a later tick. Enrollment still advances.
        // No recall touch is recorded here — the draft hasn't been sent. It's
        // attributed only if/when the collected draft is approved & sent, via the
        // `recall` tag carried on the batch item → outbox item → approve route.
        batchRequests.push({ item: { customId: `${e.id}_${e.stepIndex}`, dealId: deal?.id, contactId: e.contactId, channel: step.channel, recall: seq.id === "recall" }, input: draftInput });
        result.batched += 1;
        const ni = e.stepIndex + 1;
        if (ni >= seq.steps.length) { await updateEnrollment(e.id, { status: "completed", stepIndex: ni, lastStepAt: now }); result.completed += 1; }
        else await updateEnrollment(e.id, { stepIndex: ni, lastStepAt: now, nextDueAt: addDays(e.enrolledAt, seq.steps[ni].day) });
        result.processed += 1;
        continue;
      }

      const draft = await draftMessage(draftInput);

      // Hold auto-sends during quiet hours — queue for review instead of firing
      // a message at 2am in the prospect's timezone (this org's). (Outside
      // autopilot we always queue to Approvals.)
      const canSend = autoSend && !quietHoursNow(new Date(now), org.timezone);
      const res = canSend
        ? step.channel === "email"
          ? await sendEmail(address, draft.subject ?? "", draft.body, { unsubscribeUrl: await unsubscribeUrl(e.contactId), compliance: { orgName: org.compliance.senderName ?? org.name, address: org.compliance.address } })
          : await sendSms(address, draft.body, { from: org.callerId })
        : null;

      if (res && res.status !== "failed") {
        await provider.logActivity({
          opportunityId: deal?.id,
          contactId: e.contactId,
          kind: step.channel,
          summary: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body,
          direction: "outbound",
          occurredAt: now,
        });
        // Attribute the recall effort only on an ACTUAL send.
        if (seq.id === "recall") await recordRecallTouch({ dealId: deal?.id, contactId: e.contactId, channel: step.channel, source: "cadence", occurredAt: now });
        result.sent += 1;
      } else {
        // Queued for human approval — don't attribute a touch yet. Tag it so the
        // approve route records the touch if/when it's actually sent.
        await createOutboxItem({ dealId: deal?.id, contactId: e.contactId, channel: step.channel, subject: draft.subject, body: draft.body, source: draft.source, recall: seq.id === "recall" });
        result.queued += 1;
      }
    }

    // Advance to the next step (or complete the enrollment).
    const nextIndex = e.stepIndex + 1;
    if (nextIndex >= seq.steps.length) {
      await updateEnrollment(e.id, { status: "completed", stepIndex: nextIndex, lastStepAt: now });
      result.completed += 1;
    } else {
      await updateEnrollment(e.id, { stepIndex: nextIndex, lastStepAt: now, nextDueAt: addDays(e.enrolledAt, seq.steps[nextIndex].day) });
    }
    result.processed += 1;
  }

  // Submit all deferred drafts as one batch (~50% cheaper). Results are queued
  // to Approvals by collectDueBatches() on a later tick.
  if (batchRequests.length > 0) await submitDraftBatch(batchRequests);

    return result;
  } finally {
    await releaseCronLock(lockKey, lockFence);
  }
}

export interface BatchCollectResult {
  /** Pending batches inspected this tick. */
  checked: number;
  /** Batches that had ended and were collected. */
  collected: number;
  /** Drafts queued to Approvals from collected batches. */
  queued: number;
}

/**
 * Second phase of opt-in cadence batching: poll pending draft batches and, for
 * any that have finished, queue the resulting drafts to the Approvals outbox.
 * Called by the agent cron alongside runDueSteps. Safe to call when batching is
 * off — there simply are no pending batches.
 */
export async function collectDueBatches(): Promise<BatchCollectResult> {
  const result: BatchCollectResult = { checked: 0, collected: 0, queued: 0 };
  const pending = await listPendingBatches();
  for (const b of pending) {
    result.checked += 1;
    const drafts = await collectBatch(b.providerBatchId); // null while still processing
    if (!drafts) continue;
    for (const d of drafts) {
      await createOutboxItem({ dealId: d.item.dealId, contactId: d.item.contactId, channel: d.item.channel, subject: d.subject, body: d.body, source: "ai", recall: d.item.recall });
      result.queued += 1;
    }
    await markBatchCollected(b.providerBatchId);
    result.collected += 1;
  }
  return result;
}
