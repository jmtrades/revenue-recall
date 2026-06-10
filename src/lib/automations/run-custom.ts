import { createManualTask } from "@/lib/tasks/manual";
import { enroll } from "@/lib/cadence";
import { sendEmail } from "@/lib/comms";
import { ownerEmailsForOrg } from "@/lib/billing/lifecycle";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { listEnabledCustomAutomations } from "@/lib/automations/custom-store";
import { rulesToFire } from "@/lib/automations/custom-evaluate";
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
    const firing = rulesToFire(rules, opp, stage);
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
          /* one action failing must not stop the others, or block the move */
        }
      }
    }
  } catch {
    /* never block a stage move */
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
