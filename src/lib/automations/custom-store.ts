import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import {
  ACTION_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPS,
  CUSTOM_TRIGGER_KINDS,
  type Action,
  type Condition,
  type CustomAutomation,
  type CustomTriggerKind,
} from "@/lib/automations/custom-types";

/**
 * Org-scoped persistence for custom automation rules. Reads degrade gracefully
 * (empty without a DB / before the migration) so the engine simply runs the
 * presets alone; writes require a database. Service-role client + explicit
 * org_id scoping, resolved from the request (session or runWithOrg override).
 */

interface Row {
  id: string;
  name: string;
  trigger_kind: string;
  stage_id: string | null;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
}

const COLS = "id,name,trigger_kind,stage_id,conditions,actions,enabled";

/** Coerce stored JSONB into a clean Condition[] (drops anything malformed). */
export function sanitizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const out: Condition[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { field, op, value } = c as Record<string, unknown>;
    if (!CONDITION_FIELDS.includes(field as Condition["field"])) continue;
    if (!CONDITION_OPS.includes(op as Condition["op"])) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    out.push({ field: field as Condition["field"], op: op as Condition["op"], value: value as string | number });
  }
  return out;
}

/** Coerce stored JSONB into a clean Action[] (drops anything malformed). */
export function sanitizeActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const out: Action[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (!ACTION_TYPES.includes(o.type as ActionLike)) continue;
    if (o.type === "create_task" && typeof o.title === "string" && o.title.trim()) {
      out.push({ type: "create_task", title: o.title, dueInDays: typeof o.dueInDays === "number" ? o.dueInDays : undefined });
    } else if (o.type === "enroll_sequence" && typeof o.sequenceId === "string" && o.sequenceId) {
      out.push({ type: "enroll_sequence", sequenceId: o.sequenceId });
    } else if (o.type === "notify_owner") {
      out.push({ type: "notify_owner", message: typeof o.message === "string" ? o.message : undefined });
    }
  }
  return out;
}

type ActionLike = Action["type"];

function toAutomation(r: Row): CustomAutomation {
  return {
    id: r.id,
    name: r.name,
    triggerKind: r.trigger_kind as CustomTriggerKind,
    stageId: r.stage_id ?? undefined,
    conditions: sanitizeConditions(r.conditions),
    actions: sanitizeActions(r.actions),
    enabled: r.enabled,
  };
}

/** The org's custom automations (newest first). Never throws. */
export async function listCustomAutomations(): Promise<CustomAutomation[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  const { data, error } = await client.from("custom_automations").select(COLS).eq("org_id", orgId).order("created_at", { ascending: false });
  if (error) return [];
  return ((data as Row[] | null) ?? []).map(toAutomation);
}

/** Only the enabled rules — what the executor evaluates. Never throws. */
export async function listEnabledCustomAutomations(): Promise<CustomAutomation[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  const { data, error } = await client.from("custom_automations").select(COLS).eq("org_id", orgId).eq("enabled", true);
  if (error) return [];
  return ((data as Row[] | null) ?? []).map(toAutomation);
}

export interface CustomAutomationInput {
  name: string;
  triggerKind: CustomTriggerKind;
  stageId?: string | null;
  conditions: Condition[];
  actions: Action[];
  enabled?: boolean;
}

async function ctx() {
  const client = getSupabase();
  if (!client) throw new Error("Custom automations require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const user = await getSessionUser().catch(() => null);
  return { client, orgId, userId: user?.id ?? null };
}

export async function createCustomAutomation(input: CustomAutomationInput): Promise<CustomAutomation> {
  const { client, orgId, userId } = await ctx();
  const { data, error } = await client
    .from("custom_automations")
    .insert({
      org_id: orgId,
      name: input.name,
      trigger_kind: input.triggerKind,
      stage_id: input.triggerKind === "stage_changed" ? input.stageId || null : null,
      conditions: sanitizeConditions(input.conditions),
      actions: sanitizeActions(input.actions),
      enabled: input.enabled ?? true,
      created_by: userId,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return toAutomation(data as Row);
}

export async function updateCustomAutomation(id: string, patch: Partial<CustomAutomationInput>): Promise<void> {
  const { client, orgId } = await ctx();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.triggerKind !== undefined) update.trigger_kind = patch.triggerKind;
  if (patch.stageId !== undefined) update.stage_id = patch.stageId || null;
  if (patch.conditions !== undefined) update.conditions = sanitizeConditions(patch.conditions);
  if (patch.actions !== undefined) update.actions = sanitizeActions(patch.actions);
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  const { error } = await client.from("custom_automations").update(update).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

export async function deleteCustomAutomation(id: string): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("custom_automations").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
