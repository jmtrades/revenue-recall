import { createManualTask } from "@/lib/tasks/manual";
import { enroll } from "@/lib/cadence";
import { sendEmail } from "@/lib/comms";
import { ownerEmailsForOrg } from "@/lib/billing/lifecycle";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { resolveProvider } from "@/lib/crm/registry";
import { listEnabledCustomAutomations, listFiredKeys, recordFired } from "@/lib/automations/custom-store";
import { rulesToFire, matchesConditions } from "@/lib/automations/custom-evaluate";
import type { Action, CustomAutomation } from "@/lib/automations/custom-types";
import type { Opportunity, Stage } from "@/lib/crm/types";

/**
 * Execute the org's custom automation rules for a deal-stage transition. Runs on
 * the same safe, synchronous fire point as the preset deal automations. Actions
 * are INTERNAL only (create a task, enroll a sequence — which still flows through
 * cadence's approval/autopilot safety — or notify the owner); never an immediate
 * customer-facing send. Best-effort: every action is isolated and the whole call
 * never throws, so a rule can't block (or undo) a stage move.
 */
function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

export async function runCustomDealAutomations(opp: Opportunity, stage: Stage): Promise<void> {
  try {
    const rules = await listEnabledCustomAutomations().catch(() => [] as CustomAutomation[]);
    if (rules.length === 0) return;
    await executeRules(rulesToFire(rules, opp, stage), opp);
  } catch {
    /* never block a stage move */
  }
}

/**
 * Execute the org's lead_created rules for a freshly captured lead. Fired from
 * the shared lead-capture choke point (API, hosted form, booking page) only when
 * something NEW was created — a deduped repeat submission never re-fires. Same
 * safety contract as the deal path: internal actions only, never throws.
 */
export async function runCustomLeadAutomations(opp: Opportunity): Promise<void> {
  try {
    const rules = await listEnabledCustomAutomations().catch(() => [] as CustomAutomation[]);
    const firing = rules.filter((r) => r.enabled && r.triggerKind === "lead_created" && matchesConditions(opp, r.conditions));
    await executeRules(firing, opp);
  } catch {
    /* never block a lead capture */
  }
}

/**
 * Execute the org's deal_idle rules. Scan-based — fired from the cron per-org
 * tick (not an event), so it dedups via custom_automation_runs to fire each rule
 * at most once per deal. A deal is "idle" when it's in an open stage and its last
 * activity is at least the rule's idleDays (default 14) ago. Same safety contract
 * (internal actions only, never throws).
 */
export async function runCustomIdleAutomations(now: Date = new Date()): Promise<{ fired: number }> {
  try {
    const rules = (await listEnabledCustomAutomations().catch(() => [] as CustomAutomation[])).filter((r) => r.triggerKind === "deal_idle");
    if (rules.length === 0) return { fired: 0 };

    const provider = await resolveProvider();
    const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
    const openType = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s.type]));
    const open = opps.filter((o) => openType.get(o.stageId) === "open");
    if (open.length === 0) return { fired: 0 };

    const fired = await listFiredKeys(rules.map((r) => r.id));
    let count = 0;
    for (const opp of open) {
      const idleDays = daysSince(opp.lastActivityAt ?? opp.updatedAt ?? opp.createdAt, now);
      for (const rule of rules) {
        const key = `${rule.id}|${opp.id}`;
        if (fired.has(key)) continue;
        if (idleDays < (rule.idleDays ?? 14)) continue;
        if (!matchesConditions(opp, rule.conditions)) continue;
        await executeRules([rule], opp);
        await recordFired(rule.id, opp.id).catch(() => undefined);
        fired.add(key);
        count++;
      }
    }
    return { fired: count };
  } catch {
    return { fired: 0 };
  }
}

/** Whole days between an ISO instant and now (0 for a missing/invalid date). */
function daysSince(iso: string | undefined, now: Date): number {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

async function executeRules(firing: CustomAutomation[], opp: Opportunity): Promise<void> {
  if (firing.length === 0) return;
  const deal = (opp.title || "this deal").slice(0, 120);
  let ownerEmails: string[] | null = null; // resolved once, only if a notify action runs

  for (const rule of firing) {
    for (const action of rule.actions) {
      try {
        if (action.type === "create_task") {
          const due = typeof action.dueInDays === "number" && action.dueInDays > 0 ? inDays(action.dueInDays) : null;
          await createManualTask(`${action.title.slice(0, 160)} — ${deal}`, due);
        } else if (action.type === "enroll_sequence") {
          await enroll(action.sequenceId, `deal:${opp.id}`);
        } else if (action.type === "notify_owner") {
          ownerEmails ??= await resolveOwners();
          await notifyOwners(ownerEmails, rule, action, deal);
        }
      } catch {
        /* one action failing must not stop the others, or block the trigger */
      }
    }
  }
}

async function resolveOwners(): Promise<string[]> {
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  return ownerEmailsForOrg(orgId).catch(() => []);
}

async function notifyOwners(owners: string[], rule: CustomAutomation, action: Extract<Action, { type: "notify_owner" }>, deal: string): Promise<void> {
  if (owners.length === 0) return;
  const subject = `Automation: ${rule.name}`;
  const body = [action.message?.trim() || `Your "${rule.name}" automation fired.`, "", `Deal: ${deal}`].join("\n");
  for (const addr of owners) {
    await sendEmail(addr, subject, body, { internal: true }).catch(() => null);
  }
}
