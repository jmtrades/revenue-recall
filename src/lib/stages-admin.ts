import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { resolveProvider } from "@/lib/crm/registry";

/**
 * Org-scoped pipeline-stage administration (rename / probability / add /
 * delete / reorder). Writes go straight to the stages table — but ONLY when the
 * workspace's data source is the Supabase-backed store: a connected external
 * CRM (Close/HubSpot/…) owns its own stages and must not be edited here.
 *
 * SECURITY: `stages` has no org_id column — isolation flows through
 * pipeline_id → pipelines.org_id. We use the service-role client, so every
 * read/write below explicitly constrains pipeline_id to the org's pipelines;
 * a stage id from another tenant can never match.
 */

export type StageAdminFailure = "unsupported" | "not_found" | "has_deals" | "last_open" | "terminal";
export type StageAdminResult = { ok: true } | { ok: false; reason: StageAdminFailure };

interface StageRow {
  id: string;
  pipeline_id: string;
  label: string;
  probability: number;
  type: "open" | "won" | "lost";
  position: number;
}

async function ctx(): Promise<{ client: NonNullable<ReturnType<typeof getSupabase>>; pipelineIds: string[] } | null> {
  const client = getSupabase();
  if (!client) return null;
  if ((await resolveProvider()).info().id !== "supabase") return null;
  const orgId = await resolveActiveOrgId();
  if (!orgId) return null;
  const { data } = await client.from("pipelines").select("id").eq("org_id", orgId);
  const pipelineIds = ((data as { id: string }[] | null) ?? []).map((p) => p.id);
  return pipelineIds.length > 0 ? { client, pipelineIds } : null;
}

async function orgStages(client: NonNullable<ReturnType<typeof getSupabase>>, pipelineIds: string[]): Promise<StageRow[]> {
  const { data, error } = await client
    .from("stages")
    .select("id,pipeline_id,label,probability,type,position")
    .in("pipeline_id", pipelineIds)
    .order("position");
  if (error) throw new Error(error.message);
  return (data as StageRow[] | null) ?? [];
}

/** Add an open stage, positioned after the last open stage (before won/lost). */
export async function createStage(label: string, probability: number): Promise<StageAdminResult> {
  const c = await ctx();
  if (!c) return { ok: false, reason: "unsupported" };
  const stages = await orgStages(c.client, c.pipelineIds);
  const pipelineId = stages[0]?.pipeline_id ?? c.pipelineIds[0];
  const inPipe = stages.filter((s) => s.pipeline_id === pipelineId);
  // New ordering: existing opens, the new stage, then the terminals.
  const opens = inPipe.filter((s) => s.type === "open");
  const terminals = inPipe.filter((s) => s.type !== "open");
  const newPos = opens.length;
  const { error } = await c.client
    .from("stages")
    .insert({ pipeline_id: pipelineId, label, probability, type: "open", position: newPos });
  if (error) throw new Error(error.message);
  for (const [i, s] of terminals.entries()) {
    await c.client.from("stages").update({ position: newPos + 1 + i }).eq("id", s.id).in("pipeline_id", c.pipelineIds);
  }
  return { ok: true };
}

/** Rename a stage and/or set its win probability. */
export async function updateStage(id: string, patch: { label?: string; probability?: number }): Promise<StageAdminResult> {
  const c = await ctx();
  if (!c) return { ok: false, reason: "unsupported" };
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.probability !== undefined) update.probability = patch.probability;
  const { data, error } = await c.client
    .from("stages")
    .update(update)
    .eq("id", id)
    .in("pipeline_id", c.pipelineIds)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Swap a stage with its neighbor (within its own pipeline's ordering). */
export async function moveStage(id: string, direction: "up" | "down"): Promise<StageAdminResult> {
  const c = await ctx();
  if (!c) return { ok: false, reason: "unsupported" };
  const stages = await orgStages(c.client, c.pipelineIds);
  const me = stages.find((s) => s.id === id);
  if (!me) return { ok: false, reason: "not_found" };
  const siblings = stages.filter((s) => s.pipeline_id === me.pipeline_id);
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = siblings[direction === "up" ? idx - 1 : idx + 1];
  if (!swapWith) return { ok: true }; // already at the edge — a no-op, not an error
  await c.client.from("stages").update({ position: swapWith.position }).eq("id", me.id).in("pipeline_id", c.pipelineIds);
  await c.client.from("stages").update({ position: me.position }).eq("id", swapWith.id).in("pipeline_id", c.pipelineIds);
  return { ok: true };
}

/**
 * Delete an open stage that has no deals on it. Terminal stages (won/lost) and
 * the last open stage are protected — the board, forecast, and recall engine
 * all assume they exist.
 */
export async function deleteStage(id: string): Promise<StageAdminResult> {
  const c = await ctx();
  if (!c) return { ok: false, reason: "unsupported" };
  const stages = await orgStages(c.client, c.pipelineIds);
  const me = stages.find((s) => s.id === id);
  if (!me) return { ok: false, reason: "not_found" };
  if (me.type !== "open") return { ok: false, reason: "terminal" };
  if (stages.filter((s) => s.pipeline_id === me.pipeline_id && s.type === "open").length <= 1) {
    return { ok: false, reason: "last_open" };
  }
  const { count, error: cntErr } = await c.client
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if (cntErr) throw new Error(cntErr.message);
  if ((count ?? 0) > 0) return { ok: false, reason: "has_deals" };
  const { error } = await c.client.from("stages").delete().eq("id", id).in("pipeline_id", c.pipelineIds);
  if (error) throw new Error(error.message);
  return { ok: true };
}
