import { getBoard } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Board } from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { pipeline, opportunities, contacts, owners } = await getBoard();
  const canWrite = getProvider().info().capabilities.write;

  const contactMap: Record<string, { name: string; company?: string }> = {};
  for (const [id, c] of contacts) contactMap[id] = { name: c.name, company: c.company };
  const ownerMap: Record<string, string> = {};
  for (const [id, n] of owners) ownerMap[id] = n;

  const openValue = opportunities
    .filter((o) => pipeline.stages.find((s) => s.id === o.stageId)?.type === "open")
    .reduce((s, o) => s + o.value, 0);

  return (
    <div>
      <PageHeader
        title={pipeline.label}
        subtitle={canWrite ? `${money(openValue, opportunities[0]?.currency ?? "USD")} open · drag cards between stages` : "Read-only — your CRM controls stage changes."}
      />
      <div className="overflow-x-auto pb-4">
        <Board pipeline={pipeline} opportunities={opportunities} contacts={contactMap} owners={ownerMap} canWrite={canWrite} />
      </div>
    </div>
  );
}
