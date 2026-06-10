import { getReports } from "@/lib/queries";
import { clickStats, engagementStats } from "@/lib/tracking";
import { bookingStats } from "@/lib/meetings/stats";
import { compactMoney, money, pct } from "@/lib/format";
import { PageHeader, Stat, Card, Avatar } from "@/components/ui";
import { Funnel, Donut, BarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [r, clicks, meetings, engagement] = await Promise.all([getReports(), clickStats(), bookingStats(), engagementStats()]);
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

      <Card title="Revenue Recall ROI">
        {r.recallOutcomes.recalled === 0 ? (
          <p className="text-sm text-muted">No deals recalled yet. Enroll the recall queue to start winning revenue back.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Recalled" value={String(r.recallOutcomes.recalled)} hint="deals worked" />
              <Stat label="Re-engaged" value={String(r.recallOutcomes.reEngaged)} hint="got a touch" />
              <Stat label="Won back" value={String(r.recallOutcomes.wonBack)} tone="success" hint="closed after recall" />
              <Stat label="Recovered" value={money(r.recallOutcomes.recoveredValue, r.currency)} tone="success" hint="revenue won back" />
            </div>
            {r.recallTrend.some((w) => w.value > 0) && (
              <div>
                <p className="stat-label mb-2">Recall outreach (6 weeks)</p>
                <BarChart data={r.recallTrend} height={120} color="rgb(var(--brand-rgb))" />
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Revenue at risk by rep">
          {r.recallByOwner.length === 0 ? (
            <p className="text-sm text-muted">Nothing slipping right now.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Rep</th>
                  <th className="pb-2 text-right font-medium">At risk</th>
                  <th className="pb-2 text-right font-medium">Recoverable</th>
                </tr>
              </thead>
              <tbody>
                {r.recallByOwner.map((row) => (
                  <tr key={row.name} className="border-t border-border/60">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={row.name} size={26} />
                        <span className="text-fg">{row.name}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{row.atRisk}</td>
                    <td className="py-2.5 text-right tabular-nums text-warn">{compactMoney(row.recoverableValue, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
                      <span className="text-fg">{row.name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{row.won}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{compactMoney(row.value, m.currency)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{compactMoney(row.openValue, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Lead sources">
        {r.sources.length === 0 ? <p className="text-sm text-muted">No source data.</p> : <Donut segments={r.sources} centerLabel={String(r.sources.reduce((s, x) => s + x.value, 0))} centerSub="total deals" />}
      </Card>

      <Card title="Outreach engagement · last 30 days">
        {engagement.sent === 0 ? (
          <p className="text-sm text-muted">No outbound sent in the last 30 days. Once the engine emails and texts your pipeline, the sent → replied funnel and your reply rate show up here.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Sent" value={String(engagement.sent)} hint="emails + texts" />
            <Stat label="Replied" value={String(engagement.replied)} tone="success" hint={`${engagement.clicked} link clicks`} />
            <Stat label="Reply rate" value={pct(engagement.replyRate)} tone={engagement.replyRate >= 0.05 ? "success" : undefined} hint="replies ÷ sent" />
            <Stat label="Click rate" value={pct(engagement.clickRate)} hint="clicks ÷ sent" />
          </div>
        )}
      </Card>

      <Card title="Meetings booked">
        {!meetings.any ? (
          <p className="text-sm text-muted">No meetings booked yet. Share your booking link (Settings → Scheduling) — meetings booked there land on your pipeline and show up here.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Upcoming" value={String(meetings.upcoming)} hint="confirmed ahead" tone="success" />
              <Stat label="Booked" value={String(meetings.booked30d)} hint="last 30 days" />
              <Stat label="Cancel rate" value={pct(meetings.cancelRate)} hint={`${meetings.cancelled30d} cancelled`} tone={meetings.cancelRate > 0.3 ? "warn" : undefined} />
              <Stat label="No-show rate" value={pct(meetings.noShowRate)} hint={`${meetings.noShow30d} no-shows`} tone={meetings.noShowRate > 0.2 ? "warn" : undefined} />
            </div>
            {meetings.trend.some((w) => w.value > 0) && (
              <div>
                <p className="stat-label mb-2">Booked per week (6 weeks)</p>
                <BarChart data={meetings.trend} height={120} color="rgb(var(--brand-rgb))" />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Link engagement · last 30 days">
        {clicks.total30d === 0 ? (
          <p className="text-sm text-muted">No link clicks yet. Links in outbound email and SMS are tracked automatically — clicks land here as they happen.</p>
        ) : (
          <div>
            <p className="mb-3 text-sm text-fg"><span className="font-display text-2xl font-semibold tabular-nums tracking-tight">{clicks.total30d}</span> <span className="text-muted">clicks on your outreach links</span></p>
            <ul className="space-y-1.5">
              {clicks.topUrls.map((u) => (
                <li key={u.url} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted">{u.url}</span>
                  <span className="shrink-0 tabular-nums text-fg">{u.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
