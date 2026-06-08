import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";

/**
 * Manual tasks — a rep's own to-dos/reminders, alongside the auto-generated
 * next-actions. Backed by the org-scoped `manual_tasks` table. Reads degrade
 * gracefully (empty without a DB or before the migration is applied), so the
 * Tasks page always renders; writes require a database.
 */

export interface ManualTask {
  id: string;
  title: string;
  dueAt: string | null;
  done: boolean;
  createdAt: string;
}

/** Trim + bound a task title; returns "" when there's nothing usable. Pure. */
export function cleanTaskTitle(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

interface Row {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
}
function toTask(r: Row): ManualTask {
  return { id: r.id, title: r.title, dueAt: r.due_at, done: r.done, createdAt: r.created_at };
}

/** The current org's manual tasks (open first, newest first). Never throws. */
export async function listManualTasks(): Promise<ManualTask[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const { data, error } = await client
    .from("manual_tasks")
    .select("id,title,due_at,done,created_at")
    .eq("org_id", orgId)
    .order("done", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return []; // table missing / transient → behave as no manual tasks
  return ((data as Row[] | null) ?? []).map(toTask);
}

async function ctx() {
  const client = getSupabase();
  if (!client) throw new Error("Tasks require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const user = await getSessionUser().catch(() => null);
  return { client, orgId, userId: user?.id ?? null };
}

export async function createManualTask(title: string, dueAt?: string | null): Promise<ManualTask> {
  const { client, orgId, userId } = await ctx();
  const t = cleanTaskTitle(title);
  if (!t) throw new Error("A task needs a title.");
  const { data, error } = await client
    .from("manual_tasks")
    .insert({ org_id: orgId, title: t, due_at: dueAt || null, created_by: userId })
    .select("id,title,due_at,done,created_at")
    .single();
  if (error) throw new Error(error.message);
  return toTask(data as Row);
}

export async function setManualTaskDone(id: string, done: boolean): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("manual_tasks").update({ done }).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

export async function deleteManualTask(id: string): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("manual_tasks").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
