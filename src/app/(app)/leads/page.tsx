import { getLeadRows } from "@/lib/queries";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { PageHeader } from "@/components/ui";
import { LeadsTable } from "@/components/LeadsTable";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { rows, owners, valueLabel } = await getLeadRows();
  const industry = getIndustry(getConfig().industryId);
  return (
    <div>
      <PageHeader title={`${industry.terminology.contact}s`} subtitle={`${rows.length} records · click a row to open`} />
      <LeadsTable rows={rows} owners={owners} valueLabel={valueLabel} />
    </div>
  );
}
