import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { getIndustry } from "@/lib/industries";
import { buildRecallQueue } from "@/lib/recall/engine";
import { draftMessage } from "@/lib/ai/draft";
import { isAiConfigured } from "@/lib/ai/client";
import { sendEmail, sendSms } from "@/lib/comms";
import { createOutboxItem } from "@/lib/agent/store";
import { hasOptedOut } from "@/lib/agent/guardrails";
import { batchActivities } from "@/lib/crm/activities";
import { getSequence } from "@/lib/sequences";
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

// ---- enrollment ----

interface Target {
  opp?: Opportunity;
  contactId: string;
}

function resolveTargets(scope: string, pipelines: Pipeline[], opps: Opportunity[]): Target[] {
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const MAX = 50;
  if (scope === "recall_queue") {
    return buildRecallQueue(opps, pipelines)
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
  if (scope.startsWith("contact:")) {
    return [{ contactId: scope.slice(8) }];
  }
  return [];
}

/**
 * Enroll one or many deals/contacts into a sequence. `scope` accepts the same
 * vocabulary as Autopilot (recall_queue | all_open | deal:<id> | contact:<id>).
 * Skips anyone already actively enrolled in this sequence.
 */
export async function enroll(sequenceId: string, scope: string): Promise<EnrollResult> {
  const seq = getSequence(sequenceId);
  if (!seq) throw new Error(`Unknown sequence: ${sequenceId}`);
  if (seq.steps.length === 0) throw new Error("Sequence has no steps");

  const provider = getProvider();
  const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const targets = resolveTargets(scope, pipelines, opps);

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
  const provider = getProvider();
  const [pipelines, opps, contacts, org, voice] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    getOrgSettings(),
    getActiveVoice(),
  ]);
  const industry = getIndustry(org.industryId);
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const contactById = new Map<string, Contact>(contacts.map((c) => [c.id, c]));
  const oppById = new Map<string, Opportunity>(opps.map((o) => [o.id, o]));
  const autoSend = process.env.SEQUENCE_AUTOPILOT === "true";

  const active = await listActiveEnrollments();
  const due = active.filter((e) => e.nextDueAt <= now);
  // Prefetch activities for every due deal in one batch (avoids N+1 opt-out lookups).
  const actByOpp = await batchActivities(provider, due.map((e) => e.dealId).filter((id): id is string => Boolean(id)));

  const result: CadenceTickResult = { due: due.length, processed: 0, sent: 0, queued: 0, completed: 0, stopped: 0 };

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
    const optOutActs = deal ? actByOpp.get(deal.id) ?? [] : [];
    if (hasOptedOut(contact, deal, optOutActs)) {
      await updateEnrollment(e.id, { status: "stopped" });
      result.stopped += 1;
      continue;
    }

    const step = seq.steps[e.stepIndex];
    const name = contact?.name ?? deal?.title ?? "there";
    const stageLabel = deal ? stageById.get(deal.stageId)?.label ?? "open" : "open";

    if (step.channel === "call") {
      // Calls can't be auto-dialed from a cadence — drop a task on the timeline.
      await provider.logActivity({
        opportunityId: deal?.id,
        contactId: e.contactId,
        kind: "task",
        summary: `Cadence call — ${seq.name}: ${step.subject}. ${step.body}`,
        occurredAt: now,
      });
    } else {
      const draft = await draftMessage({
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
        recallReason: seq.id === "recall" ? "lost_winnable" : undefined,
        daysSinceContact: daysSince(deal?.lastActivityAt),
        instruction: `This is step ${e.stepIndex + 1} of the "${seq.name}" cadence. Intent: ${step.body}`,
        voice,
      });

      const to =
        step.channel === "email"
          ? contact?.points.find((p) => p.channel === "email")?.value
          : contact?.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value;

      if (autoSend && to) {
        const res = step.channel === "email" ? await sendEmail(to, draft.subject ?? "", draft.body) : await sendSms(to, draft.body);
        if (res.status !== "failed") {
          await provider.logActivity({
            opportunityId: deal?.id,
            contactId: e.contactId,
            kind: step.channel,
            summary: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body,
            direction: "outbound",
            occurredAt: now,
          });
          result.sent += 1;
        } else {
          await createOutboxItem({ dealId: deal?.id, contactId: e.contactId, channel: step.channel, subject: draft.subject, body: draft.body, source: draft.source });
          result.queued += 1;
        }
      } else {
        await createOutboxItem({ dealId: deal?.id, contactId: e.contactId, channel: step.channel, subject: draft.subject, body: draft.body, source: draft.source });
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

  return result;
}
