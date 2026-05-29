import { getOrgSettings } from "@/lib/org";
import { automationsFor } from "@/lib/automations";
import { PageHeader } from "@/components/ui";
import { AutomationsList } from "@/components/AutomationsList";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const automations = automationsFor((await getOrgSettings()).industryId);
  return (
    <div>
      <PageHeader title="Automations" subtitle="Set-and-forget rules that handle follow-up, hand-offs, and recall for you." />
      <AutomationsList automations={automations} />
    </div>
  );
}
