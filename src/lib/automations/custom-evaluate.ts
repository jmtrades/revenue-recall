import type { Opportunity, Stage } from "@/lib/crm/types";
import type { Condition, CustomAutomation } from "@/lib/automations/custom-types";

/**
 * Pure matching logic for custom automation rules — no I/O, fully testable.
 * Decides (a) whether a deal-stage transition fires a rule's trigger and (b)
 * whether the deal satisfies every condition (conditions are ANDed; an empty
 * list matches all).
 */

function fieldValue(opp: Opportunity, field: Condition["field"]): string | number | undefined {
  switch (field) {
    case "value":
      return opp.value;
    case "source":
      return opp.source ?? "";
    case "pipeline":
      return opp.pipelineId;
  }
}

function matchesOne(opp: Opportunity, c: Condition): boolean {
  const fv = fieldValue(opp, c.field);
  if (fv === undefined) return false;

  if (c.field === "value") {
    const a = Number(fv);
    const b = Number(c.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    switch (c.op) {
      case "eq":
        return a === b;
      case "gt":
        return a > b;
      case "gte":
        return a >= b;
      case "lt":
        return a < b;
      case "lte":
        return a <= b;
      default:
        return false; // `contains` is meaningless on a number
    }
  }

  // String fields (source, pipeline): case-insensitive, trimmed.
  const a = String(fv).trim().toLowerCase();
  const b = String(c.value).trim().toLowerCase();
  switch (c.op) {
    case "eq":
      return a === b;
    case "contains":
      return b.length > 0 && a.includes(b);
    default:
      return false; // numeric ops are meaningless on a string
  }
}

/** True when the deal satisfies every condition (empty conditions → always true). */
export function matchesConditions(opp: Opportunity, conditions: Condition[]): boolean {
  return conditions.every((c) => matchesOne(opp, c));
}

/** True when a stage transition fires this rule's trigger. stage_changed means a
 *  move INTO an open stage (optionally narrowed to one stage); won/lost have
 *  their own triggers so a single move never double-fires across kinds. */
export function triggerMatches(rule: CustomAutomation, stage: Stage): boolean {
  switch (rule.triggerKind) {
    case "deal_won":
      return stage.type === "won";
    case "deal_lost":
      return stage.type === "lost";
    case "stage_changed":
      return stage.type === "open" && (!rule.stageId || rule.stageId === stage.id);
    default:
      return false;
  }
}

/** The rules (from a candidate set) that should fire for this transition. */
export function rulesToFire(rules: CustomAutomation[], opp: Opportunity, stage: Stage): CustomAutomation[] {
  return rules.filter((r) => r.enabled && triggerMatches(r, stage) && matchesConditions(opp, r.conditions));
}
