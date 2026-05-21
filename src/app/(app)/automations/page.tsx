import { getConfig } from "@/lib/config";
import { automationsFor } from "@/lib/automations";
import { PageHeader } from "@/components/ui";
import { AutomationsList } from "@/components/AutomationsList";

export const dynamic = "force-dynamic";

export default function AutomationsPage() {
  const automations = automationsFor(getConfig().industryId);
  return (
    <div>
      <PageHeader title="Automations" subtitle="Set-and-forget rules that handle follow-up, hand-offs, and recall for you." />
      <AutomationsList automations={automations} />
    </div>
  );
}
