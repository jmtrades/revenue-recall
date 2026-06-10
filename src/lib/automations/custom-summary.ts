import type { Action, Condition, CustomAutomation } from "@/lib/automations/custom-types";

/**
 * Human-readable one-line summary of a custom automation rule, for the list UI.
 * Pure — label lookups (stage / sequence ids → names) are passed in, so it's
 * trivially testable and has no I/O.
 */

export interface Labels {
  stage?: (id: string) => string;
  sequence?: (id: string) => string;
}

const OP_SYMBOL: Record<Condition["op"], string> = { eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "contains" };

export function triggerLabel(rule: CustomAutomation, labels: Labels = {}): string {
  switch (rule.triggerKind) {
    case "deal_won":
      return "Deal won";
    case "deal_lost":
      return "Deal lost";
    case "stage_changed":
      return rule.stageId ? `Deal moves to ${labels.stage?.(rule.stageId) ?? "a stage"}` : "Deal changes stage";
    case "lead_created":
      return "New lead created";
    case "deal_idle":
      return `Deal idle ${rule.idleDays ?? 14} days`;
    default:
      return "Trigger";
  }
}

function conditionLabel(c: Condition): string {
  const op = OP_SYMBOL[c.op] ?? c.op;
  return c.op === "contains" ? `${c.field} contains "${c.value}"` : `${c.field} ${op} ${c.value}`;
}

function actionLabel(a: Action, labels: Labels = {}): string {
  switch (a.type) {
    case "create_task":
      return `create task "${a.title}"${a.dueInDays ? ` (due +${a.dueInDays}d)` : ""}`;
    case "enroll_sequence":
      return `enroll in ${labels.sequence?.(a.sequenceId) ?? "a sequence"}`;
    case "notify_owner":
      return "notify the owner";
    default:
      return "do something";
  }
}

/** e.g. `Deal won when value ≥ 5000 → create task "Send contract", notify the owner`. */
export function summarizeRule(rule: CustomAutomation, labels: Labels = {}): string {
  const when = rule.conditions.length ? ` when ${rule.conditions.map(conditionLabel).join(" and ")}` : "";
  const actions = rule.actions.length ? rule.actions.map((a) => actionLabel(a, labels)).join(", ") : "do nothing";
  return `${triggerLabel(rule, labels)}${when} → ${actions}`;
}
