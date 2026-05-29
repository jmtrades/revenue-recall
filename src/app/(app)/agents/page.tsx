import { PageHeader } from "@/components/ui";
import { AgentsView } from "@/components/AgentsView";
import { listTasks, listRuns } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";
import { guardrailConfig } from "@/lib/agent/guardrails";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [tasks, runs, pipelines] = await Promise.all([
    listTasks().catch(() => []),
    listRuns(undefined, 25).catch(() => []),
    getProvider().listPipelines().catch(() => []),
  ]);
  const stages = pipelines[0]?.stages.filter((s) => s.type === "open").map((s) => ({ id: s.id, label: s.label })) ?? [];
  const g = guardrailConfig();

  return (
    <div>
      <PageHeader
        title="Autopilot"
        subtitle="Create your own tasks in plain English. AI works each deal — drafting, sending, and logging — and records every action."
      />
      <div className="mb-5 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-fg">Autonomy guardrails</p>
        <p className="mt-0.5 text-xs text-muted">Always on in auto mode, so hands-off outreach stays safe and never spams.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="pill bg-surface-2 text-muted">Never contacts opt-outs</span>
          <span className="pill bg-surface-2 text-muted">Re-engages a soft &ldquo;no&rdquo; after {g.declineCooldownDays}d</span>
          <span className="pill bg-surface-2 text-muted">Won&apos;t re-touch within {g.cooldownDays}d</span>
          {g.quietHours && <span className="pill bg-surface-2 text-muted">Quiet hours {g.quietHours}</span>}
          <span className="pill bg-surface-2 text-muted">{g.dailyCap === null ? "No send cap" : `Cap ${g.dailyCap}/run`}</span>
        </div>
      </div>
      <AgentsView initialTasks={tasks} initialRuns={runs} stages={stages} />
    </div>
  );
}
