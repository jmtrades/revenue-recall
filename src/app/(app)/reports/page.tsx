import { getReports, getWonBackDeals } from "@/lib/queries";
import { clickStats, engagementStats } from "@/lib/tracking";
import { bookingStats } from "@/lib/meetings/stats";
import { callStats, bestCallWindow, windowLabel } from "@/lib/calls/analytics";
import { cachedRecallTouches } from "@/lib/crm/cached";
import { recallInsights, recallWinAttribution, recallWinBySource, recallWinByCadenceStep, recoveredByOwner, recoveredByWeek } from "@/lib/recall/insights";
import { getOrgSettings } from "@/lib/org";
import { resolveProvider } from "@/lib/crm/registry";
import { compactMoney, money, pct } from "@/lib/format";
import { PageHeader, Stat, Card, Avatar } from "@/components/ui";
import { ShareResultsButton } from "@/components/ShareResultsButton";
import { Funnel, Donut, BarChart } from "@/components/charts";
import type { Activity } from "@/lib/crm/types";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [r, clicks, meetings, engagement, recentActs, org] = await Promise.all([
    getReports(),
    clickStats(),
    bookingStats(),
    engagementStats(),
    resolveProvider().then((p) => p.listRecentActivities(500)).catch(() => [] as Activity[]),
    getOrgSettings(),
  ]);
  const m = r.metrics;
  const [recallTouches, wonBack] = await Promise.all([
    cachedRecallTouches().catch(() => []),
    getWonBackDeals().catch(() => []),
  ]);
  const recall = recallInsights(recallTouches);
  const wins = wonBack.map((d) => ({ dealId: d.dealId, value: d.value, wonAt: d.wonAt }));
  const attribution = recallWinAttribution(recallTouches, wins);
  const bySource = recallWinBySource(recallTouches, wins);
  const byStep = recallWinByCadenceStep(recallTouches, wins);
  const recoveredReps = recoveredByOwner(wonBack);
  const recoveredTrend = recoveredByWeek(wonBack);
  const calls = callStats(recentActs);
  const { best: bestWindow } = bestCallWindow(recentActs, 30, new Date(), org.timezone || undefined);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Pipeline health, conversion, sources, and team performance." />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Closed Won" value={money(m.wonValue, m.currency)} hint={`${m.wonCount} deals`} tone="success" countUp />
        <Stat label="Avg Deal Size" value={money(m.avgDealSize, m.currency)} countUp />
        <Stat label="Win Rate" value={pct(m.winRate)} hint={`${m.lostCount} lost`} countUp />
        <Stat label="Open Pipeline" value={money(m.openValue, m.currency)} hint={`${m.openCount} deals`} countUp />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Conversion funnel">
          <Funnel stages={r.funnel} />
        </Card>
        <Card title="Won revenue (6 months)">
          <BarChart data={r.monthlyWon} height={200} color="#34d399" />
        </Card>
      </div>

      <Card title="Calling · last 7 days">
        {calls.dials === 0 ? (
          <p className="text-sm text-muted">No dials in the last week. The power dialer logs every attempt here — connects, voicemails, and no-answers alike.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Dials" value={String(calls.dials)} hint={`${calls.noAnswers} no-answer · ${calls.voicemails} voicemail`} />
              <Stat label="Connects" value={String(calls.connects)} tone="success" hint="reached a person" />
              <Stat label="Connect rate" value={pct(calls.connectRate)} hint="of all dials" />
              <Stat label="Talk time" value={`${calls.talkMinutes} min`} hint="connected minutes" />
            </div>
            <div>
              <p className="stat-label mb-2">Dials per day</p>
              <BarChart data={calls.perDay} height={120} color="rgb(var(--brand-rgb))" />
            </div>
            {bestWindow && (
              <p className="text-sm text-muted">
                Best window: <span className="font-medium text-fg">{windowLabel(bestWindow.hour)}</span> — {pct(bestWindow.connectRate)} connect rate over the last 30 days. Stack your call blocks there.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Revenue Recall ROI" action={r.recallOutcomes.wonBack > 0 ? (
        <div className="flex items-center gap-4">
          <ShareResultsButton recoveredValue={r.recallOutcomes.recoveredValue} wonBack={r.recallOutcomes.wonBack} currency={r.currency} topChannel={attribution.byChannel[0]?.channel} />
          <a href="/api/recall/export" className="text-sm text-brand hover:underline" download>Export won-back deals (CSV)</a>
        </div>
      ) : undefined}>
        {r.recallOutcomes.recalled === 0 ? (
          <p className="text-sm text-muted">No deals recalled yet. Enroll the recall queue to start winning revenue back.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            {recoveredTrend.some((w) => w.value > 0) && (
              <div>
                <p className="stat-label mb-2">Revenue recovered (6 weeks)</p>
                <BarChart data={recoveredTrend} height={120} color="#34d399" />
              </div>
            )}
            {recall.totalTouches > 0 && (
              <div>
                <p className="stat-label mb-2">Where recall effort goes</p>
                <div className="space-y-2">
                  {recall.byChannel.map((c) => (
                    <div key={c.channel} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs capitalize text-muted">{c.channel}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(c.share * 100)}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted">{c.touches} touch{c.touches === 1 ? "" : "es"} · {c.deals} deal{c.deals === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">{recall.totalTouches} recall touches across {recall.dealsTouched} deal{recall.dealsTouched === 1 ? "" : "s"}{recall.bySource.length ? ` · mostly ${recall.bySource[0].source}` : ""}.</p>
              </div>
            )}
            {attribution.byChannel.length > 0 && (
              <div>
                <p className="stat-label mb-2">What&apos;s winning deals back</p>
                <div className="space-y-2">
                  {attribution.byChannel.map((c) => (
                    <div key={c.channel} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs capitalize text-muted">{c.channel}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(c.share * 100)}%` }} />
                      </div>
                      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted">{compactMoney(c.recoveredValue, r.currency)} · {c.deals} deal{c.deals === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Last-touch attribution: the channel that last re-engaged each won-back deal{attribution.unattributedDeals > 0 ? ` · ${attribution.unattributedDeals} won back with no recorded touch` : ""}.</p>
              </div>
            )}
            {bySource.attributedValue > 0 && (
              <div>
                <p className="stat-label mb-2">Autopilot ROI</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Stat label="Recovered by autopilot" value={compactMoney(bySource.autopilotRecoveredValue, r.currency)} tone="success" hint={`${bySource.autopilotDeals} deal${bySource.autopilotDeals === 1 ? "" : "s"} the AI closed the loop on`} />
                  <Stat label="Autopilot share" value={pct(bySource.attributedValue > 0 ? bySource.autopilotRecoveredValue / bySource.attributedValue : 0)} hint="of attributed recovered revenue" />
                </div>
                <div className="mt-3 space-y-2">
                  {bySource.bySource.map((s) => (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs capitalize text-muted">{s.source}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className={`h-full rounded-full ${s.source === "autopilot" ? "bg-brand" : "bg-success/60"}`} style={{ width: `${Math.round(s.share * 100)}%` }} />
                      </div>
                      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted">{compactMoney(s.recoveredValue, r.currency)} · {s.deals} deal{s.deals === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Recovered revenue by the source that last re-engaged each won-back deal.</p>
              </div>
            )}
            {byStep.groups.length > 0 && (
              <div>
                <p className="stat-label mb-2">Which step wins deals back</p>
                <div className="space-y-2">
                  {byStep.groups.map((g) => (
                    <div key={g.key} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-xs text-muted">{g.key}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(g.share * 100)}%` }} />
                      </div>
                      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted">{compactMoney(g.recoveredValue, r.currency)} · {g.deals} deal{g.deals === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Which step in your recall sequence last re-engaged each won-back deal — double down on what closes the loop.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {recoveredReps.length > 0 && (
        <Card title="Revenue recovered by rep">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Rep</th>
                <th className="pb-2 text-right font-medium">Won back</th>
                <th className="pb-2 text-right font-medium">Recovered</th>
              </tr>
            </thead>
            <tbody>
              {recoveredReps.map((row) => (
                <tr key={row.name} className="border-t border-border/60">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar name={row.name} size={26} />
                      <span className="text-fg">{row.name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{row.deals}</td>
                  <td className="py-2.5 text-right tabular-nums text-success">{compactMoney(row.recoveredValue, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

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
          <div className="overflow-x-auto">
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
          </div>
        </Card>
      </div>

      <Card title="Lead sources">
        {r.sources.length === 0 ? <p className="text-sm text-muted">No source data.</p> : <Donut segments={r.sources} centerLabel={String(r.sources.reduce((s, x) => s + x.value, 0))} centerSub="total deals" />}
      </Card>

      <Card title="Outreach engagement · last 30 days">
        {engagement.sent === 0 ? (
          <p className="text-sm text-muted">No outbound sent in the last 30 days. Once the engine emails and texts your pipeline, the sent → replied funnel and your reply rate show up here.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
