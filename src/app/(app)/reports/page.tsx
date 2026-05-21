import { getReports } from "@/lib/queries";
import { compactMoney, money, pct } from "@/lib/format";
import { PageHeader, Stat, Card, Avatar } from "@/components/ui";
import { Funnel, Donut, BarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const r = await getReports();
  const m = r.metrics;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Pipeline health, conversion, sources, and team performance." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Closed Won" value={money(m.wonValue, m.currency)} hint={`${m.wonCount} deals`} tone="success" />
        <Stat label="Avg Deal Size" value={money(m.avgDealSize, m.currency)} />
        <Stat label="Win Rate" value={pct(m.winRate)} hint={`${m.lostCount} lost`} />
        <Stat label="Open Pipeline" value={money(m.openValue, m.currency)} hint={`${m.openCount} deals`} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Conversion funnel">
          <Funnel stages={r.funnel} />
        </Card>
        <Card title="Won revenue (6 months)">
          <BarChart data={r.monthlyWon} height={200} color="#34d399" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Lead sources">
          {r.sources.length === 0 ? <p className="text-sm text-muted">No source data.</p> : <Donut segments={r.sources} centerLabel={String(r.sources.reduce((s, x) => s + x.value, 0))} centerSub="total deals" />}
        </Card>
        <Card title="Team leaderboard">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Rep</th>
                <th className="pb-2 text-right font-medium">Won</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
                <th className="pb-2 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {r.leaderboard.map((row) => (
                <tr key={row.name} className="border-t border-border/60">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar name={row.name} size={26} />
                      <span className="text-white">{row.name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{row.won}</td>
                  <td className="py-2.5 text-right tabular-nums text-white">{compactMoney(row.value, m.currency)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{compactMoney(row.openValue, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
