import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { buildRecallQueue } from "@/lib/recall/engine";
import { draftMessage } from "@/lib/ai/draft";
import { isAiConfigured } from "@/lib/ai/client";
import { sendEmail, sendSms } from "@/lib/comms";
import { compactMoney } from "@/lib/format";
import { createRun, touchTask } from "@/lib/agent/store";
import type { AgentAction, AgentRun, AgentTask } from "@/lib/agent/types";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";

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
    const [pipelines, opps, contacts, org] = await Promise.all([
      provider.listPipelines(),
      provider.listOpportunities(),
      provider.listContacts(),
      getOrgSettings(),
    ]);
    const contactById = new Map<string, Contact>(contacts.map((c) => [c.id, c]));
    const industry = getIndustry(org.industryId);
    const targets = await resolveTargets(task, pipelines, opps);

    const actions: AgentAction[] = [];
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

      const history = (await provider.listActivities(t.opp.id)).map((a) => `${a.kind}: ${a.summary}`);
      const draft = await draftMessage({
        channel: task.channel === "call" ? "call" : task.channel,
        contactName: name,
        company: contact?.company,
        dealTitle: t.opp.title,
        valueLabel: industry.terminology.value,
        value: t.opp.value,
        currency: t.opp.currency,
        stageLabel: pipelines.flatMap((p) => p.stages).find((s) => s.id === t.opp.stageId)?.label ?? "open",
        industryLabel: industry.label,
        recallReason: t.reason,
        daysSinceContact: t.days ?? daysSince(t.opp.lastActivityAt),
        history,
        instruction: task.goal,
      });

      const to =
        task.channel === "email"
          ? contact?.points.find((p) => p.channel === "email")?.value
          : contact?.points.find((p) => p.channel === "phone")?.value;

      let result: AgentAction["result"] = "drafted";
      if (task.channel === "call") {
        result = "queued"; // talk track prepared for the dialer
      } else if (task.autonomy === "auto") {
        if (!to) {
          result = "skipped";
        } else {
          const res = task.channel === "email" ? await sendEmail(to, draft.subject ?? "", draft.body) : await sendSms(to, draft.body);
          result = res.status === "failed" ? "skipped" : res.status === "sent" ? "sent" : "logged";
          if (result !== "skipped") {
            sent += 1;
            await provider.logActivity({
              opportunityId: t.opp.id,
              contactId: t.opp.contactId,
              kind: task.channel,
              summary: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body,
              direction: "outbound",
              occurredAt: new Date().toISOString(),
            });
          }
        }
      }
      if (result === "drafted" || result === "queued") drafted += 1;

      actions.push({
        type: task.channel,
        dealId: t.opp.id,
        title: name,
        detail: draft.subject ? `${draft.subject} — ${draft.body.slice(0, 140)}` : draft.body.slice(0, 180),
        result,
        source: draft.source,
        value: t.recoverable,
      });
    }

    const verb = task.autonomy === "auto" && task.channel !== "call" && task.channel !== "none" ? `${sent} sent` : `${drafted} prepared`;
    const summary =
      targets.length === 0
        ? "No matching deals to work right now."
        : `Worked ${targets.length} deal${targets.length === 1 ? "" : "s"} · ${verb}${recoverable > 0 ? ` · ${compactMoney(recoverable, "USD")} recoverable` : ""}.`;

    return createRun({
      taskId: task.id,
      status: "completed",
      summary,
      actions,
      itemsProcessed: targets.length,
      recoverable,
      ai: isAiConfigured(),
      startedAt,
      finishedAt: new Date().toISOString(),
    }).then(async (run) => {
      await touchTask(task.id);
      return run;
    });
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
