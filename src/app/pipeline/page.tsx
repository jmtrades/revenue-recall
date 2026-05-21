import { getBoard } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { PageHeader } from "@/components/ui";
import { Board } from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { pipeline, opportunities, contacts } = await getBoard();
  const canWrite = getProvider().info().capabilities.write;

  const contactMap: Record<string, { name: string; company?: string }> = {};
  for (const [id, c] of contacts) contactMap[id] = { name: c.name, company: c.company };

  return (
    <div>
      <PageHeader
        title={pipeline.label}
        subtitle={canWrite ? "Drag deals forward by changing their stage." : "Read-only — your CRM controls stage changes."}
      />
      <div className="overflow-x-auto pb-4">
        <Board pipeline={pipeline} opportunities={opportunities} contacts={contactMap} canWrite={canWrite} />
      </div>
    </div>
  );
}
