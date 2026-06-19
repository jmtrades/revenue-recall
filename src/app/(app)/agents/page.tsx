import { AgentsView } from "@/components/AgentsView";
import { listTasks, listRuns } from "@/lib/agent/store";
import { summarizeRuns } from "@/lib/agent/summary";
import { resolveProvider } from "@/lib/crm/registry";
import { guardrailConfig } from "@/lib/agent/guardrails";
import { getOrgSettings } from "@/lib/org";

export const metadata = { title: "Autopilot" };
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

  // Live summary across the run ledger — what the autonomous force has actually
  // done. Deduped by deal (see summarizeRuns) so "deals worked" / "recoverable
  // touched" can't inflate past the real deal count and contradict the recall queue.
  const { actionsTaken, dealsWorked, recoverableTouched } = summarizeRuns(runs);
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
    "Calls & texts only 8am–9pm the prospect's time",
    ...(g.quietHours ? [`Quiet hours ${g.quietHours}`] : []),
    // Only surface the daily cap when one is actually set — advertising
    // "No send cap" framed the ABSENCE of a guardrail as a guardrail.
    ...(g.dailyCap !== null ? [`Max ${g.dailyCap} sends/day`] : []),
  ];

  return <AgentsView initialTasks={tasks} initialRuns={runs} stages={stages} summary={summary} guardrails={guardrails} />;
}
