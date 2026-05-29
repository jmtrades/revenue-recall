import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { getIndustry } from "@/lib/industries";
import { buildRecallQueue } from "@/lib/recall/engine";
import { draftMessage } from "@/lib/ai/draft";
import { isAiConfigured } from "@/lib/ai/client";
import { sendEmail, sendSms, placeCall } from "@/lib/comms";
import { sendGate, type SkipReason } from "@/lib/agent/guardrails";
import { compactMoney } from "@/lib/format";
import { createRun, createOutboxItem, touchTask } from "@/lib/agent/store";
import { batchActivities } from "@/lib/crm/activities";
import { contactInsights, reachHint } from "@/lib/insights";
import { isEntitled } from "@/lib/billing/enforce";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import type { AgentAction, AgentRun, AgentTask } from "@/lib/agent/types";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";

const SKIP_LABEL: Record<NonNullable<SkipReason>, string> = {
  opted_out: "Skipped — they opted out / asked us to stop.",
  recently_declined: "Held — soft 'no for now'; will re-engage after the cooldown.",
  recently_contacted: "Skipped — already contacted recently (cooldown).",
  quiet_hours: "Held — outside sending hours, will retry next run.",
  daily_cap: "Held — daily send cap reached.",
};

const MAX_ITEMS = 8;

interface Target {
  opp: Opportunity;
  reason?: string;
  recommendation?: string;
  days?: number;
  recoverable: number;
}

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

async function resolveTargets(task: AgentTask, pipelines: Pipeline[], opps: Opportunity[]): Promise<Target[]> {
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));

  if (task.scope === "recall_queue") {
    const items = buildRecallQueue(opps, pipelines).slice(0, MAX_ITEMS);
    return items
      .map((r): Target | null => {
        const opp = opps.find((o) => o.id === r.opportunityId);
        return opp ? { opp, reason: r.reason, recommendation: r.recommendation, days: r.daysSinceActivity, recoverable: r.weightedValue } : null;
      })
      .filter((t): t is Target => t !== null);
  }
  if (task.scope === "all_open") {
    return opps.filter((o) => stageById.get(o.stageId)?.type === "open").slice(0, MAX_ITEMS).map((opp) => ({ opp, recoverable: 0 }));
  }
  if (task.scope.startsWith("stage:")) {
    const sid = task.scope.slice(6);
    return opps.filter((o) => o.stageId === sid).slice(0, MAX_ITEMS).map((opp) => ({ opp, recoverable: 0 }));
  }
  if (task.scope.startsWith("deal:")) {
    const opp = opps.find((o) => o.id === task.scope.slice(5));
    return opp ? [{ opp, recoverable: 0 }] : [];
  }
  return [];
}

/** Execute one Autopilot task: the AI works each target per the task's goal,
 *  drafting (review) or sending (auto), and the whole run is logged to the ledger. */
export async function runTask(task: AgentTask): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const provider = getProvider();

  try {
    const [pipelines, opps, contacts, org, voice] = await Promise.all([
      provider.listPipelines(),
      provider.listOpportunities(),
      provider.listContacts(),
      getOrgSettings(),
      getActiveVoice(),
    ]);
    const contactById = new Map<string, Contact>(contacts.map((c) => [c.id, c]));
    const industry = getIndustry(org.industryId);
    const targets = await resolveTargets(task, pipelines, opps);
    // Prefetch every target's activities in one batch (avoids N+1 in the loop).
    const actByOpp = await batchActivities(provider, targets.map((t) => t.opp.id));

    // When billing enforcement is on, a plan without autopilot can't auto-send —
    // it still drafts to Approvals. Compute the effective autonomy once.
    const autonomy: AgentTask["autonomy"] = task.autonomy === "auto" && !(await isEntitled("autopilot")) ? "review" : task.autonomy;

    const actions: AgentAction[] = [];
    const pending: { dealId: string; contactId: string; channel: "email" | "sms"; subject?: string; body: string; source: "ai" | "template" }[] = [];
    let recoverable = 0;
    let sent = 0;
    let drafted = 0;

    for (const t of targets) {
      recoverable += t.recoverable;
      const contact = contactById.get(t.opp.contactId);
      const name = contact?.name ?? t.opp.title;

      if (task.channel === "none") {
        actions.push({
          type: "recommend",
          dealId: t.opp.id,
          title: name,
          detail: t.recommendation ?? task.goal,
          result: "queued",
          source: "template",
          value: t.recoverable,
        });
        continue;
      }

      // Guardrails: never message someone who opted out; in auto mode also respect
      // cooldown, quiet hours, and the daily cap. Checked before drafting to save cost.
      const activities = actByOpp.get(t.opp.id) ?? [];
      const gate = sendGate({ contact, opp: t.opp, activities, autonomy, sentSoFar: sent });
      if (gate) {
        actions.push({ type: task.channel, dealId: t.opp.id, title: name, detail: SKIP_LABEL[gate], result: "skipped", source: "template", value: t.recoverable });
        continue;
      }

      // What we know about reaching this person (channel they reply on, timing).
      const insights = contactInsights(activities);
      const emailTo = contact?.points.find((p) => p.channel === "email")?.value;
      const phoneTo = contact?.points.find((p) => p.channel === "phone")?.value;
      const reachOn = (ch: "email" | "sms" | "call") => (ch === "email" ? emailTo : phoneTo);

      // Effective channel. In auto mode, if the requested channel can't reach them
      // (no address/number on file), fall back to one that can — preferring the
      // channel they actually reply on — so the touch isn't silently wasted.
      // Review mode always keeps the rep's chosen channel (they send by hand).
      let channel = task.channel as "email" | "sms" | "call";
      if (autonomy === "auto" && !reachOn(channel)) {
        const order: ("email" | "sms" | "call")[] = [insights.bestChannel ?? "sms", "sms", "call", "email"];
        const alt = order.find((c) => c !== channel && reachOn(c));
        if (alt) channel = alt;
      }

      const history = activities.map((a) => `${a.kind}: ${a.summary}`);
      const draft = await draftMessage({
        channel,
        contactName: name,
        company: contact?.company,
        dealTitle: t.opp.title,
        valueLabel: industry.terminology.value,
        value: t.opp.value,
        currency: t.opp.currency,
        stageLabel: pipelines.flatMap((p) => p.stages).find((s) => s.id === t.opp.stageId)?.label ?? "open",
        industryLabel: industry.label,
        industryId: industry.id,
        recallReason: t.reason,
        daysSinceContact: t.days ?? daysSince(t.opp.lastActivityAt),
        history,
        instruction: task.goal,
        language: org.language,
        timingHint: reachHint(insights) ?? undefined,
        voice,
      });

      const to = reachOn(channel);

      let result: AgentAction["result"] = "drafted";
      if (channel === "call") {
        if (autonomy === "auto" && to) {
          // Place the call autonomously (real dial when Twilio is set; logged otherwise).
          const res = await placeCall(to);
          result = res.status === "failed" ? "skipped" : res.status === "sent" ? "sent" : "logged";
          if (result !== "skipped") {
            sent += 1;
            await provider.logActivity({
              opportunityId: t.opp.id,
              contactId: t.opp.contactId,
              kind: "call",
              summary: `Auto-dialed. Talk track:\n${draft.body}`,
              direction: "outbound",
              occurredAt: new Date().toISOString(),
            });
          }
        } else {
          result = "queued"; // talk track prepared for the dialer (review mode / no number)
        }
      } else if (autonomy === "auto") {
        if (!to) {
          result = "skipped";
        } else {
          const res =
            channel === "email"
              ? await sendEmail(to, draft.subject ?? "", draft.body, {
                  unsubscribeUrl: unsubscribeUrl(t.opp.contactId),
                  compliance: { orgName: org.compliance.senderName ?? org.name, address: org.compliance.address },
                })
              : await sendSms(to, draft.body);
          result = res.status === "failed" ? "skipped" : res.status === "sent" ? "sent" : "logged";
          if (result !== "skipped") {
            sent += 1;
            await provider.logActivity({
              opportunityId: t.opp.id,
              contactId: t.opp.contactId,
              kind: channel,
              summary: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body,
              direction: "outbound",
              occurredAt: new Date().toISOString(),
            });
          }
        }
      }
      if (result === "drafted" || result === "queued") drafted += 1;

      // Review-mode email/SMS drafts become approval-inbox items.
      if (result === "drafted" && (channel === "email" || channel === "sms")) {
        pending.push({ dealId: t.opp.id, contactId: t.opp.contactId, channel, subject: draft.subject, body: draft.body, source: draft.source });
      }

      actions.push({
        type: channel,
        dealId: t.opp.id,
        title: name,
        detail: draft.subject ? `${draft.subject} — ${draft.body.slice(0, 140)}` : draft.body.slice(0, 180),
        result,
        source: draft.source,
        value: t.recoverable,
      });
    }

    const skipped = actions.filter((a) => a.result === "skipped").length;
    const verb = autonomy === "auto" && task.channel !== "none" ? `${sent} sent` : `${drafted} prepared`;
    const summary =
      targets.length === 0
        ? "No matching deals to work right now."
        : `Worked ${targets.length} deal${targets.length === 1 ? "" : "s"} · ${verb}${skipped ? ` · ${skipped} skipped (guardrails)` : ""}${recoverable > 0 ? ` · ${compactMoney(recoverable, "USD")} recoverable` : ""}.`;

    const run = await createRun({
      taskId: task.id,
      status: "completed",
      summary,
      actions,
      itemsProcessed: targets.length,
      recoverable,
      ai: isAiConfigured(),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    for (const p of pending) {
      await createOutboxItem({ runId: run.id, taskId: task.id, ...p });
    }
    await touchTask(task.id);
    return run;
  } catch (err) {
    return createRun({
      taskId: task.id,
      status: "failed",
      summary: "Run failed.",
      actions: [],
      itemsProcessed: 0,
      recoverable: 0,
      ai: isAiConfigured(),
      error: err instanceof Error ? err.message : "Unknown error",
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }
}
