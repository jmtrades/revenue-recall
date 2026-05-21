import { getLeads } from "@/lib/queries";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { contacts, opps } = await getLeads();
  const industry = getIndustry(getConfig().industryId);

  return (
    <div>
      <PageHeader title={`${industry.terminology.contact}s`} subtitle={`${contacts.length} records`} />
      <section className="card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">{industry.terminology.value}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const opp = opps.get(c.id);
              const email = c.points.find((p) => p.channel === "email")?.value ?? "—";
              const phone = c.points.find((p) => p.channel === "phone")?.value ?? "—";
              return (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{email}</td>
                  <td className="px-4 py-3 text-muted">{phone}</td>
                  <td className="px-4 py-3 tabular-nums text-white">{opp ? money(opp.value, opp.currency) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
