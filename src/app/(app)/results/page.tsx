import Link from "next/link";
import { PageHeader, Stat, Card, EmptyState, Button } from "@/components/ui";
import { BarChart, Funnel } from "@/components/charts";
import { CopySummary } from "@/components/roi/CopySummary";
import { loadRoi, timelineFor } from "@/lib/roi/load";
import { buildWeeklySummary } from "@/lib/roi/weekly";
import { money, pct } from "@/lib/format";
import { publicSiteUrl } from "@/lib/site";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

function deltaHint(value: number | null, noun: string): string | undefined {
  if (value === null) return `new ${noun} this window`;
  if (value === 0) return `flat vs the prior window`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}% vs the prior window`;
}

export default async function ResultsPage(props: { searchParams: Promise<{ lead?: string }> }) {
  const searchParams = await props.searchParams;
  const loaded = await loadRoi();
  const { report } = loaded;
  const cur = report.currency;
  const base = publicSiteUrl();
  const letter = buildWeeklySummary(report, "Your workspace", base ? `${base.replace(/\/$/, "")}/results` : null);
  const lead = searchParams.lead?.slice(0, 200);
  const timeline = lead ? timelineFor(loaded.events, lead) : report.timeline;
  const quiet = report.current.sent === 0 && report.revenueRecovered === 0 && report.rescuedLeads === 0 && report.webinarJoined === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Results"
        subtitle="What the system did, what came back, and what to change. Last 30 days against the 30 before them."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CopySummary text={`${letter.subject}\n\n${letter.body}`} />
            <Button href="/api/analytics/export" variant="outline" size="sm">
              Export CSV
            </Button>
          </div>
        }
      />

      <p className="text-xs leading-relaxed text-muted">
        {loaded.stored > 0
          ? `${loaded.stored} live ledger ${loaded.stored === 1 ? "event" : "events"}`
          : "No live ledger rows yet"}
        {loaded.projected > 0
          ? ` · ${loaded.projected} earlier ${loaded.projected === 1 ? "event" : "events"} filled in from CRM history, so work from before this ledger is not missing`
          : ""}
        . {report.hoursNote}
      </p>

      {quiet ? (
        <EmptyState
          iconName="spark"
          title="Nothing logged in this window"
          hint="Sends, calls, replies, webinar joins and leaves, bookings, and wins land here as they happen. An empty window stays empty — we don't fill it with a sample."
          action={<Button href="/launch">Go live</Button>}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue recovered" value={money(report.revenueRecovered, cur)} hint={deltaHint(report.delta.revenue, "revenue")} tone="success" countUp />
            <Stat label="Won deals" value={String(report.wonDeals)} hint="attributed when a touch preceded the win" />
            <Stat label="Rescued from drop-off" value={String(report.rescuedLeads)} hint={deltaHint(report.delta.rescued, "rescues") ?? `${report.webinarLeft} left · ${report.webinarJoined} joins`} tone={report.rescuedLeads > 0 ? "success" : "default"} />
            <Stat label="Hours saved" value={String(report.hoursSaved)} hint={deltaHint(report.delta.hoursSaved, "hours") ?? "estimated from AI actions"} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card title="Funnel" className="lg:col-span-3">
              <Funnel stages={report.funnel.map((s) => ({ label: s.label, count: s.count, value: s.count }))} />
              <p className="mt-3 text-xs text-muted">Unique leads in the window. Engaged means a click, a connect, or a webinar join.</p>
            </Card>
            <Card title="Recovered by day" className="lg:col-span-2">
              {report.trend.some((d) => d.value > 0) ? (
                <BarChart data={report.trend} height={180} />
              ) : (
                <p className="text-sm text-muted">No won revenue in this window yet. Replies and bookings are still in the funnel.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="By channel">
              {report.channels.length === 0 ? (
                <p className="text-sm text-muted">No channel activity in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="pb-2 font-medium">Channel</th>
                        <th className="pb-2 font-medium">Touches</th>
                        <th className="pb-2 font-medium">Replies</th>
                        <th className="pb-2 font-medium">Connects</th>
                        <th className="pb-2 text-right font-medium">Recovered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.channels.map((c) => (
                        <tr key={c.channel} className="border-t border-border/70">
                          <td className="py-2 capitalize text-fg">{c.channel}</td>
                          <td className="py-2 tabular-nums text-body">{c.touches}</td>
                          <td className="py-2 tabular-nums text-body">{c.replies}</td>
                          <td className="py-2 tabular-nums text-body">{c.connects}</td>
                          <td className="py-2 text-right tabular-nums text-fg">{money(c.revenue, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="What to change">
              {report.insights.length === 0 ? (
                <p className="text-sm text-muted">Not enough volume for a callout yet. Insights show up once a channel has a pattern, not after one send.</p>
              ) : (
                <ul className="space-y-4">
                  {report.insights.map((insight) => (
                    <li key={insight.title}>
                      <p className={`text-sm font-medium ${insight.tone === "attention" ? "text-warn" : "text-success"}`}>{insight.title}</p>
                      <p className="mt-1 text-sm text-body">{insight.detail}</p>
                      <p className="mt-1 text-sm text-muted">{insight.recommendation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {report.campaigns.length > 0 && (
            <Card title="By sequence">
              <ul className="space-y-2">
                {report.campaigns.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-fg">{c.id}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {c.touches} touches · {c.replies} replies · {money(c.revenue, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {report.cohorts.length > 0 && (
            <Card title="Cohorts" >
              <p className="mb-3 text-xs text-muted">Leads grouped by the week they first showed up, and how many of them were later recovered.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="pb-2 font-medium">Week of</th>
                      <th className="pb-2 font-medium">Leads</th>
                      <th className="pb-2 font-medium">Recovered</th>
                      <th className="pb-2 font-medium">Rate</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cohorts.map((c) => (
                      <tr key={c.week} className="border-t border-border/70">
                        <td className="py-2 tabular-nums text-fg">{c.week}</td>
                        <td className="py-2 tabular-nums">{c.leads}</td>
                        <td className="py-2 tabular-nums">{c.recovered}</td>
                        <td className="py-2 tabular-nums">{pct(c.rate)}</td>
                        <td className="py-2 text-right tabular-nums">{money(c.revenue, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Card
        title={lead ? `Timeline · ${lead}` : "Recent activity"}
        action={lead ? <Link href="/results" className="text-sm text-brand hover:underline">All activity</Link> : undefined}
      >
        {timeline.length === 0 ? (
          <p className="text-sm text-muted">{lead ? "No events for that lead." : "No events in this window."}</p>
        ) : (
          <ol className="space-y-2">
            {timeline.map((e) => {
              const who = e.contactId || e.dealId || e.leadId;
              const href = e.dealId ? `/deals/${e.dealId}` : e.contactId ? `/leads/${e.contactId}` : who ? `/results?lead=${encodeURIComponent(who)}` : undefined;
              return (
                <li key={e.dedupeKey} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0">
                  <div className="min-w-0">
                    <span className="text-sm text-fg">{e.name}</span>
                    {e.channel && <span className="ml-2 text-xs capitalize text-muted">{e.channel}</span>}
                    {e.actor && <span className="ml-2 text-xs text-muted">{e.actor}</span>}
                    {typeof e.revenue === "number" && e.revenue > 0 && <span className="ml-2 text-xs text-success">{money(e.revenue, cur)}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <time dateTime={e.occurredAt}>{e.occurredAt.slice(0, 16).replace("T", " ")}</time>
                    {href && (
                      <Link href={href} className="text-brand hover:underline">
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card title="Weekly letter" action={<CopySummary text={`${letter.subject}\n\n${letter.body}`} />}>
        <p className="text-sm font-medium text-fg">{letter.subject}</p>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-body">{letter.body}</pre>
      </Card>
    </div>
  );
}
