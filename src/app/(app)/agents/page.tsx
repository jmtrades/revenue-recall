import { PageHeader } from "@/components/ui";
import { AgentsView } from "@/components/AgentsView";
import { listTasks, listRuns } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [tasks, runs, pipelines] = await Promise.all([
    listTasks().catch(() => []),
    listRuns(undefined, 25).catch(() => []),
    getProvider().listPipelines().catch(() => []),
  ]);
  const stages = pipelines[0]?.stages.filter((s) => s.type === "open").map((s) => ({ id: s.id, label: s.label })) ?? [];

  return (
    <div>
      <PageHeader
        title="Autopilot"
        subtitle="Create your own tasks in plain English. AI works each deal — drafting, sending, and logging — and records every action."
      />
      <AgentsView initialTasks={tasks} initialRuns={runs} stages={stages} />
    </div>
  );
}
