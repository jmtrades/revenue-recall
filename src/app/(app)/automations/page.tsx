import { getOrgSettings } from "@/lib/org";
import { effectiveAutomations } from "@/lib/automations";
import { listCustomAutomations } from "@/lib/automations/custom-store";
import { allSequencesFor } from "@/lib/sequences-store";
import { getTeamAndPipeline } from "@/lib/queries";
import { getSessionRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { PageHeader } from "@/components/ui";
import { AutomationsList } from "@/components/AutomationsList";
import { CustomAutomationsManager } from "@/components/automations/CustomAutomationsManager";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const org = await getOrgSettings();
  const automations = effectiveAutomations(org.industryId, org.automations);
  const [custom, sequences, { pipeline }] = await Promise.all([listCustomAutomations(), allSequencesFor(org.industryId), getTeamAndPipeline()]);
  const canManage = !isAuthRequired() || ["owner", "admin"].includes((await getSessionRole()) ?? "");
  const stages = pipeline.stages.filter((s) => s.type === "open").map((s) => ({ id: s.id, label: s.label }));

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Automations" subtitle="Set-and-forget rules that handle follow-up, hand-offs, and recall for you." />
        <AutomationsList automations={automations} />
      </div>
      <div>
        <h2 className="mb-3 text-xl font-semibold text-fg">Build your own</h2>
        <CustomAutomationsManager initial={custom} stages={stages} sequences={sequences.map((s) => ({ id: s.id, name: s.name }))} canManage={canManage} />
      </div>
    </div>
  );
}
