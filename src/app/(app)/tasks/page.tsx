import { getTasks } from "@/lib/queries";
import { listManualTasks } from "@/lib/tasks/manual";
import { PageHeader } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { ManualTasks } from "@/components/ManualTasks";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, manual] = await Promise.all([getTasks(), listManualTasks()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" subtitle="Your prioritized next actions, generated from deals that need attention." />
      <ManualTasks initial={manual} />
      <TaskList tasks={tasks} />
    </div>
  );
}
