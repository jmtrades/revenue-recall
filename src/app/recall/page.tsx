import { getRecallQueue } from "@/lib/queries";
import { money, relativeDays } from "@/lib/format";
import { PageHeader, Stat, ReasonBadge, ChannelBadge, ScoreDot } from "@/components/ui";
import type { Contact } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

function primaryContact(c?: Contact): string {
  if (!c) return "—";
  const email = c.points.find((p) => p.channel === "email")?.value;
  return email ?? c.points[0]?.value ?? c.name;
}

export default async function RecallPage() {
  const { items, summary, contacts, opps } = await getRecallQueue();

  return (
    <div>
      <PageHeader
        title="Revenue Recall"
        subtitle="Deals slipping away, ranked by how much revenue you can still save and how urgent it is."
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Recoverable" value={money(summary.totalRecoverable, summary.currency)} tone="warn" hint="probability-weighted" />
        <Stat label="Going cold" value={String(summary.byReason.going_cold.count)} hint={money(summary.byReason.going_cold.value, summary.currency)} />
        <Stat label="Stalled" value={String(summary.byReason.stalled.count)} hint={money(summary.byReason.stalled.value, summary.currency)} />
        <Stat label="Winnable losses" value={String(summary.byReason.lost_winnable.count)} hint={money(summary.byReason.lost_winnable.value, summary.currency)} />
      </section>

      <section className="card mt-6 p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted">Nothing to recall right now. Every active deal has a recent touch.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Why</th>
                <th className="px-4 py-3 font-medium">Recoverable</th>
                <th className="px-4 py-3 font-medium">Last touch</th>
                <th className="px-4 py-3 font-medium">Next best action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const opp = opps.get(r.opportunityId);
                const contact = opp ? contacts.get(opp.contactId) : undefined;
                return (
                  <tr key={r.opportunityId} className="border-b border-border/60 align-top last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-4"><ScoreDot score={r.score} /></td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white">{r.title}</div>
                      <div className="text-xs text-muted">{primaryContact(contact)}</div>
                    </td>
                    <td className="px-4 py-4"><ReasonBadge reason={r.reason} /></td>
                    <td className="px-4 py-4 tabular-nums text-white">{money(r.weightedValue, r.currency)}<div className="text-xs text-muted">of {money(r.value, r.currency)}</div></td>
                    <td className="px-4 py-4 text-muted">{relativeDays(r.daysSinceActivity)}</td>
                    <td className="px-4 py-4">
                      <div className="mb-2"><ChannelBadge channel={r.channel} /></div>
                      <p className="max-w-md text-xs leading-relaxed text-muted">{r.recommendation}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
