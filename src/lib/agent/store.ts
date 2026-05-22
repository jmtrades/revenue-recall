import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import type { AgentRun, AgentTask, NewAgentTask } from "@/lib/agent/types";

/**
 * Persistence for Autopilot tasks + the run ledger. Uses Supabase when
 * configured (org-scoped), else an in-memory store so the demo works.
 */

async function orgId(): Promise<string> {
  const id = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!id) throw new Error("No active org");
  return id;
}

// ---- in-memory fallback (demo) ----
const memTasks: AgentTask[] = [];
const memRuns: AgentRun[] = [];

function mapTask(r: Record<string, unknown>): AgentTask {
  return {
    id: r.id as string,
    name: r.name as string,
    goal: r.goal as string,
    trigger: r.trigger as AgentTask["trigger"],
    scope: r.scope as string,
    channel: r.channel as AgentTask["channel"],
    autonomy: r.autonomy as AgentTask["autonomy"],
    enabled: r.enabled as boolean,
    createdAt: r.created_at as string,
    lastRunAt: (r.last_run_at as string) ?? undefined,
  };
}

function mapRun(r: Record<string, unknown>): AgentRun {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    status: r.status as AgentRun["status"],
    summary: (r.summary as string) ?? "",
    actions: (r.actions as AgentRun["actions"]) ?? [],
    itemsProcessed: Number(r.items_processed ?? 0),
    recoverable: Number(r.recoverable ?? 0),
    ai: Boolean(r.ai),
    error: (r.error as string) ?? undefined,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? undefined,
  };
}

export async function createTask(input: NewAgentTask): Promise<AgentTask> {
  const task = {
    name: input.name,
    goal: input.goal,
    trigger: input.trigger ?? "manual",
    scope: input.scope ?? "recall_queue",
    channel: input.channel ?? "email",
    autonomy: input.autonomy ?? "review",
    enabled: true,
  };
  if (!isSupabaseConfigured()) {
    const t: AgentTask = { ...task, id: `at_${Date.now()}`, createdAt: new Date().toISOString() };
    memTasks.unshift(t);
    return t;
  }
  const client = getSupabase()!;
  const { data, error } = await client.from("agent_tasks").insert({ org_id: await orgId(), ...task }).select("*").single();
  if (error) throw new Error(error.message);
  return mapTask(data);
}

export async function listTasks(): Promise<AgentTask[]> {
  if (!isSupabaseConfigured()) return memTasks;
  const client = getSupabase()!;
  const { data, error } = await client.from("agent_tasks").select("*").eq("org_id", await orgId()).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTask);
}

export async function getTask(id: string): Promise<AgentTask | null> {
  if (!isSupabaseConfigured()) return memTasks.find((t) => t.id === id) ?? null;
  const client = getSupabase()!;
  const { data } = await client.from("agent_tasks").select("*").eq("org_id", await orgId()).eq("id", id).maybeSingle();
  return data ? mapTask(data) : null;
}

export async function deleteTask(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const i = memTasks.findIndex((t) => t.id === id);
    if (i >= 0) memTasks.splice(i, 1);
    return;
  }
  const client = getSupabase()!;
  await client.from("agent_tasks").delete().eq("org_id", await orgId()).eq("id", id);
}

export async function touchTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const t = memTasks.find((x) => x.id === id);
    if (t) t.lastRunAt = now;
    return;
  }
  await getSupabase()!.from("agent_tasks").update({ last_run_at: now }).eq("org_id", await orgId()).eq("id", id);
}

export async function createRun(run: Omit<AgentRun, "id">): Promise<AgentRun> {
  if (!isSupabaseConfigured()) {
    const r: AgentRun = { ...run, id: `ar_${Date.now()}` };
    memRuns.unshift(r);
    return r;
  }
  const client = getSupabase()!;
  const { data, error } = await client
    .from("agent_runs")
    .insert({
      org_id: await orgId(),
      task_id: run.taskId,
      status: run.status,
      summary: run.summary,
      actions: run.actions,
      items_processed: run.itemsProcessed,
      recoverable: run.recoverable,
      ai: run.ai,
      error: run.error ?? null,
      started_at: run.startedAt,
      finished_at: run.finishedAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRun(data);
}

export async function listRuns(taskId?: string, limit = 25): Promise<AgentRun[]> {
  if (!isSupabaseConfigured()) return (taskId ? memRuns.filter((r) => r.taskId === taskId) : memRuns).slice(0, limit);
  const client = getSupabase()!;
  let q = client.from("agent_runs").select("*").eq("org_id", await orgId());
  if (taskId) q = q.eq("task_id", taskId);
  const { data, error } = await q.order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRun);
}
