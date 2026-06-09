import { getBoard } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { money } from "@/lib/format";
import { PageHeader, EmptyState, Button } from "@/components/ui";
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
        subtitle={canWrite ? `${money(openValue, opportunities[0]?.currency ?? "USD")} open · drag a card, or use its stage menu, to move it` : "Read-only — your CRM controls stage changes."}
      />
      {opportunities.length === 0 ? (
        <EmptyState
          iconName="pipeline"
          title="Your board is empty"
          hint="Import your leads or connect a source and deals will populate these stages automatically. Then move them forward by dragging a card — or using its stage menu on any device."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button href="/settings?tab=import" variant="primary" size="sm">Import leads</Button>
              <Button href="/leads" variant="outline" size="sm">View leads</Button>
            </div>
          }
        />
      ) : (
        <div className="overflow-x-auto pb-4">
          <Board pipeline={pipeline} opportunities={opportunities} contacts={contactMap} owners={ownerMap} canWrite={canWrite} />
        </div>
      )}
    </div>
  );
}
