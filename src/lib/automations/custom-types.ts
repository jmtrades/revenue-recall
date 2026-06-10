/**
 * Custom (org-authored) automation rules — types shared by the store, the pure
 * evaluator, the executor, and the API. The executable trigger set is the
 * synchronous deal-stage family today (the same safe fire point as the presets);
 * lead_created / deal_idle can join later via the cron scan.
 */

export type CustomTriggerKind = "stage_changed" | "deal_won" | "deal_lost";
export const CUSTOM_TRIGGER_KINDS: CustomTriggerKind[] = ["stage_changed", "deal_won", "deal_lost"];

export type ConditionField = "value" | "source" | "pipeline";
export const CONDITION_FIELDS: ConditionField[] = ["value", "source", "pipeline"];

export type ConditionOp = "eq" | "gt" | "gte" | "lt" | "lte" | "contains";
export const CONDITION_OPS: ConditionOp[] = ["eq", "gt", "gte", "lt", "lte", "contains"];

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  value: string | number;
}

export type ActionType = "create_task" | "enroll_sequence" | "notify_owner";
export const ACTION_TYPES: ActionType[] = ["create_task", "enroll_sequence", "notify_owner"];

export type Action =
  | { type: "create_task"; title: string; dueInDays?: number }
  | { type: "enroll_sequence"; sequenceId: string }
  | { type: "notify_owner"; message?: string };

export interface CustomAutomation {
  id: string;
  name: string;
  triggerKind: CustomTriggerKind;
  /** Narrows stage_changed to a single stage; null/undefined = any open-stage move. */
  stageId?: string | null;
  conditions: Condition[];
  actions: Action[];
  enabled: boolean;
}
