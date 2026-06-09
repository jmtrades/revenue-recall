import { AgentsView } from "@/components/AgentsView";
import { listTasks, listRuns } from "@/lib/agent/store";
import { resolveProvider } from "@/lib/crm/registry";
import { guardrailConfig } from "@/lib/agent/guardrails";
import { getOrgSettings } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [tasks, runs, pipelines, org] = await Promise.all([
    listTasks().catch(() => []),
    listRuns(undefined, 25).catch(() => []),
    (await resolveProvider()).listPipelines().catch(() => []),
    getOrgSettings().catch(() => null),
  ]);
  const stages = pipelines[0]?.stages.filter((s) => s.type === "open").map((s) => ({ id: s.id, label: s.label })) ?? [];
  const g = guardrailConfig();

  // Live summary across the run ledger — what the autonomous force has actually done.
  const actionsTaken = runs.reduce((s, r) => s + r.actions.length, 0);
  const dealsWorked = runs.reduce((s, r) => s + r.itemsProcessed, 0);
  const recoverableTouched = runs.reduce((s, r) => s + (r.recoverable ?? 0), 0);
  const activeAuto = tasks.filter((t) => t.enabled && t.autonomy === "auto").length;
  const summary = {
    activeTasks: tasks.filter((t) => t.enabled).length,
    activeAuto,
    actionsTaken,
    dealsWorked,
    recoverableTouched,
    currency: org?.currency ?? "USD",
  };

  const guardrails = [
    "Never contacts opt-outs",
    `Re-engages a soft "no" after ${g.declineCooldownDays}d`,
    `Won't re-touch within ${g.cooldownDays}d`,
    ...(g.quietHours ? [`Quiet hours ${g.quietHours}`] : []),
    g.dailyCap === null ? "No send cap" : `Cap ${g.dailyCap}/run`,
  ];

  return <AgentsView initialTasks={tasks} initialRuns={runs} stages={stages} summary={summary} guardrails={guardrails} />;
}
