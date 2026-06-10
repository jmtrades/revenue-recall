import { getLeadRows } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { allSequencesFor } from "@/lib/sequences-store";
import { PageHeader } from "@/components/ui";
import { LeadsTable } from "@/components/LeadsTable";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { rows, owners, valueLabel } = await getLeadRows();
  const org = await getOrgSettings();
  const industry = getIndustry(org.industryId);
  const sequences = (await allSequencesFor(org.industryId)).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div>
      <PageHeader
        title={`${industry.terminology.contact}s`}
        subtitle={`${rows.length} records · click a row to open`}
        action={
          <a
            href="/api/contacts/export"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition hover:text-fg"
            download
          >
            Export CSV
          </a>
        }
      />
      <LeadsTable rows={rows} owners={owners} valueLabel={valueLabel} sequences={sequences} />
    </div>
  );
}
