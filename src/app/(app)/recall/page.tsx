import { getRecallQueue, getRecallOutcomes } from "@/lib/queries";
import { money } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { MiniLegendBar } from "@/components/charts";
import { RecallQueue, type RecallRow } from "@/components/RecallQueue";
import type { Contact } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

function primaryContact(c?: Contact): string {
  if (!c) return "—";
  return c.points.find((p) => p.channel === "email")?.value ?? c.points[0]?.value ?? c.name;
}

export default async function RecallPage() {
  const [{ items, summary, contacts, opps }, outcomes] = await Promise.all([getRecallQueue(), getRecallOutcomes()]);

  const rows: RecallRow[] = items.map((r) => {
    const opp = opps.get(r.opportunityId);
    const contact = opp ? contacts.get(opp.contactId) : undefined;
    return {
      opportunityId: r.opportunityId,
      title: r.title,
      contactLabel: primaryContact(contact),
      reason: r.reason,
      score: r.score,
      value: r.value,
      weightedValue: r.weightedValue,
      currency: r.currency,
      daysSinceActivity: r.daysSinceActivity,
      channel: r.channel,
      recommendation: r.recommendation,
      engaged: r.engaged,
      overdue: r.overdue,
    };
  });

  const segments = [
    { label: "Going cold", value: summary.byReason.going_cold.count, color: "#fbbf24" },
    { label: "Stalled", value: summary.byReason.stalled.count, color: "#f87171" },
    { label: "Winnable losses", value: summary.byReason.lost_winnable.count, color: "rgb(var(--brand-rgb))" },
    { label: "Untouched", value: summary.byReason.no_activity.count, color: "#8a93a6" },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Recall" subtitle="Deals slipping away, ranked by recoverable revenue and urgency. Click any row to act." />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Stat label="Recoverable" value={money(summary.totalRecoverable, summary.currency)} tone="warn" hint="probability-weighted" />
        <Stat label="At-risk deals" value={String(summary.itemCount)} hint="across all reasons" />
        <div className="card">
          <p className="stat-label mb-3">Breakdown</p>
          {segments.length > 0 ? <MiniLegendBar segments={segments} /> : <p className="text-sm text-muted">Nothing at risk.</p>}
        </div>
      </section>

      {outcomes.recalled > 0 && (
        <section>
          <p className="stat-label mb-3">Recall results so far</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Recalled" value={String(outcomes.recalled)} hint="deals worked" />
            <Stat label="Re-engaged" value={String(outcomes.reEngaged)} hint="got a touch" />
            <Stat label="Won back" value={String(outcomes.wonBack)} tone="success" hint="closed after recall" />
            <Stat label="Recovered" value={money(outcomes.recoveredValue, outcomes.currency)} tone="success" hint="revenue won back" />
          </div>
        </section>
      )}

      <RecallQueue rows={rows} />
    </div>
  );
}
