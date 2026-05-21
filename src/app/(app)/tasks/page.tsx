import { getTasks } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { TaskList } from "@/components/TaskList";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await getTasks();
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Your prioritized next actions, generated from deals that need attention." />
      <TaskList tasks={tasks} />
    </div>
  );
}
