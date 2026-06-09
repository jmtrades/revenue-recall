import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import { getSequence, sequencesFor, type Sequence, type SequenceStep, type SeqChannel } from "@/lib/sequences";

/**
 * Org-authored sequences — the write side the preset cadences never had.
 * Backed by the org-scoped `custom_sequences` table (steps as JSONB in the
 * exact SequenceStep shape, so the cadence runtime runs them unchanged).
 * Reads degrade gracefully (presets only) without a DB; writes require one.
 */

export interface CustomSequenceInput {
  name: string;
  goal?: string;
  steps: { day: number; channel: SeqChannel; subject?: string; body: string }[];
}

interface Row {
  id: string;
  name: string;
  description: string | null;
  steps: unknown;
}

function toSteps(raw: unknown): SequenceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      day: Number(s.day) || 0,
      channel: (["call", "email", "sms"].includes(String(s.channel)) ? String(s.channel) : "email") as SeqChannel,
      subject: typeof s.subject === "string" ? s.subject : "",
      body: typeof s.body === "string" ? s.body : "",
    }))
    .sort((a, b) => a.day - b.day);
}

function toSequence(r: Row): Sequence {
  return { id: r.id, name: r.name, goal: r.description ?? "", industries: ["*"], steps: toSteps(r.steps) };
}

/** The org's own sequences (newest first). Never throws. */
export async function listCustomSequences(): Promise<Sequence[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  const { data, error } = await client
    .from("custom_sequences")
    .select("id,name,description,steps")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) return []; // table missing / transient → presets only
  return ((data as Row[] | null) ?? []).map(toSequence);
}

/** A sequence by id: industry preset first (slug ids), else the org's own
 *  (uuid ids) — the lookup the cadence runtime and detail page use. */
export async function resolveSequence(id: string): Promise<Sequence | undefined> {
  const preset = getSequence(id);
  if (preset) return preset;
  const client = getSupabase();
  if (!client) return undefined;
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return undefined;
  const { data } = await client.from("custom_sequences").select("id,name,description,steps").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data ? toSequence(data as Row) : undefined;
}

/** The org's sequences merged ahead of the industry presets. */
export async function allSequencesFor(industryId: string): Promise<Sequence[]> {
  const custom = await listCustomSequences();
  return [...custom, ...sequencesFor(industryId)];
}

async function ctx() {
  const client = getSupabase();
  if (!client) throw new Error("Custom sequences require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const user = await getSessionUser().catch(() => null);
  return { client, orgId, userId: user?.id ?? null };
}

function normalizeSteps(steps: CustomSequenceInput["steps"]): SequenceStep[] {
  return steps
    .map((s) => ({ day: Math.max(0, Math.round(s.day)), channel: s.channel, subject: s.subject?.trim() ?? "", body: s.body.trim() }))
    .sort((a, b) => a.day - b.day);
}

export async function createCustomSequence(input: CustomSequenceInput): Promise<Sequence> {
  const { client, orgId, userId } = await ctx();
  const { data, error } = await client
    .from("custom_sequences")
    .insert({ org_id: orgId, name: input.name, description: input.goal || null, steps: normalizeSteps(input.steps), created_by: userId })
    .select("id,name,description,steps")
    .single();
  if (error) throw new Error(error.message);
  return toSequence(data as Row);
}

export async function updateCustomSequence(id: string, patch: Partial<CustomSequenceInput>): Promise<void> {
  const { client, orgId } = await ctx();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.goal !== undefined) update.description = patch.goal || null;
  if (patch.steps !== undefined) update.steps = normalizeSteps(patch.steps);
  const { error } = await client.from("custom_sequences").update(update).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

export async function deleteCustomSequence(id: string): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("custom_sequences").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
