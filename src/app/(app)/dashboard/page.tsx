import Link from "next/link";
import { getOverview, getActivityFeed, getReports } from "@/lib/queries";
import { engagementStats } from "@/lib/tracking";
import { bookingStats } from "@/lib/meetings/stats";
import { getOrgSettings } from "@/lib/org";
import { getSubscription } from "@/lib/billing/store";
import { getSessionUser } from "@/lib/auth";
import { firstName } from "@/lib/copy";
import { compactMoney, money, pct, relativeDays } from "@/lib/format";
import { PageHeader, Stat, ReasonBadge, ScoreDot, Card, Avatar, ActivityIcon, Button } from "@/components/ui";
import { Funnel, ProgressRing, BarChart, Sparkline } from "@/components/charts";
import { Icon } from "@/components/icons";
import { DashboardWelcome } from "@/components/DashboardWelcome";
import { StartCheckoutWatcher } from "@/components/StartCheckoutWatcher";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return relativeDays(days);
}

function partOfDay(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** A short, personal nudge based on what's actually waiting in the recall queue. */
function focusLine(recallCount: number, recoverable: number, currency: string): string {
  if (recallCount === 0) return "Your pipeline is well tended — nothing slipping today.";
  return `${recallCount} ${recallCount === 1 ? "deal needs" : "deals need"} attention — ${money(recoverable, currency)} recoverable if you act now.`;
}

export default async function DashboardPage() {
  const [o, feed, reports, org, user, sub, engagement, meetings] = await Promise.all([
    getOverview(),
    getActivityFeed(8),
    getReports(),
    getOrgSettings(),
    getSessionUser(),
    getSubscription(),
    engagementStats(),
    bookingStats(),
  ]);
  // Only auto-open checkout for someone without a subscription — never
  // re-prompt a customer who's already paying (or mid-dunning).
  const checkoutEligible = sub.status === "none" || sub.status === "canceled";
  const m = o.metrics;
  const wonSeries = reports.monthlyWon;
  const wonThisMonth = wonSeries[wonSeries.length - 1]?.value ?? 0;
  const wonPrevMonth = wonSeries[wonSeries.length - 2]?.value ?? 0;
  // Honest month-over-month delta from real history (only shown when there's a prior month to compare).
  const wonDelta = wonPrevMonth > 0 ? Math.round(((wonThisMonth - wonPrevMonth) / wonPrevMonth) * 100) : undefined;
  // First revenue after a zero month (common early on): a "% vs last" is
  // undefined, so show a positive "new" cue instead of a blank where the trend is.
  const firstRevenue = wonPrevMonth === 0 && wonThisMonth > 0;
  const attainment = org.monthlyQuota > 0 ? wonThisMonth / org.monthlyQuota : 0;
  const greeting = user?.name ? `${partOfDay(new Date().getHours())}, ${firstName(user.name)}` : partOfDay(new Date().getHours());
  // Surface outbound health only once there's something to show, so it never
  // reads as a row of dead zeros on a workspace that hasn't sent yet.
  const showOutreach = engagement.sent > 0 || meetings.upcoming > 0 || meetings.booked30d > 0;

  // Brand-new workspace: no deals and nothing logged yet. Zero-filled stats and
  // empty charts read as broken — show a guided first-run experience instead.
  const isEmpty = m.openCount + m.wonCount + m.lostCount === 0 && feed.length === 0;
  if (isEmpty) return (<><StartCheckoutWatcher eligible={checkoutEligible} /><DashboardWelcome greeting={greeting} /></>);

  return (
    <div className="space-y-6">
      <StartCheckoutWatcher eligible={checkoutEligible} />
      <PageHeader
        title={greeting}
        subtitle={focusLine(o.recallSummary.itemCount, o.recallSummary.totalRecoverable, m.currency)}
        action={<Button href="/recall" variant="primary"><Icon name="recall" size={15} /> Work the recall queue</Button>}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open Pipeline" value={money(m.openValue, m.currency)} hint={`${m.openCount} open ${o.terminology.opportunity.toLowerCase()}s`} icon="pipeline" countUp />
        <Stat label="Weighted Forecast" value={money(m.weightedForecast, m.currency)} hint="probability-adjusted" icon="forecast" countUp />
        <Stat label="Recoverable Revenue" value={money(o.recallSummary.totalRecoverable, m.currency)} hint={`${o.recallSummary.itemCount} at-risk deals`} tone="warn" icon="recall" countUp />
        <Stat label="Win Rate" value={pct(m.winRate)} hint={`${m.wonCount} won · ${m.lostCount} lost`} tone="success" icon="reports" countUp />
      </section>

      {showOutreach && (
        <Card title="Outreach · last 30 days" action={<Link href="/reports" className="text-sm text-brand hover:underline">Reports →</Link>}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Sent" value={String(engagement.sent)} hint="emails + texts" icon="mail" />
            <Stat label="Reply rate" value={pct(engagement.replyRate)} hint={`${engagement.replied} replies`} tone={engagement.replyRate >= 0.05 ? "success" : "default"} icon="inbox" />
            <Stat label="Meetings ahead" value={String(meetings.upcoming)} hint="confirmed" tone="success" icon="calendar" />
            <Stat label="Booked" value={String(meetings.booked30d)} hint="last 30 days" icon="approvals" />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Revenue trend" className="lg:col-span-2" action={<Link href="/reports" className="text-sm text-brand hover:underline">Reports →</Link>}>
          <div className="mb-4 flex items-end gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-fg">{money(wonThisMonth, m.currency)}</span>
                {wonDelta !== undefined && (
                  <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${wonDelta >= 0 ? "text-success" : "text-danger"}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {wonDelta >= 0 ? <path d="M7 17 17 7M17 7H9M17 7v8" /> : <path d="M7 7l10 10M17 17H9M17 17V9" />}
                    </svg>
                    {Math.abs(wonDelta)}%
                  </span>
                )}
                {wonDelta === undefined && firstRevenue && (
                  <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-xs font-semibold text-success">new</span>
                )}
              </div>
              <div className="text-xs text-muted">won this month{wonDelta !== undefined ? " · vs last" : firstRevenue ? " · first revenue" : ""}</div>
            </div>
            <div className="mb-1 ml-auto">
              <Sparkline data={reports.monthlyWon.map((x) => x.value)} width={200} height={44} />
            </div>
          </div>
          <BarChart data={reports.monthlyWon.map((x) => ({ label: x.label, value: x.value }))} height={150} />
        </Card>

        <Card title="Monthly goal">
          <div className="flex flex-col items-center gap-3 py-2">
            <ProgressRing value={attainment} size={120} thickness={11} color={attainment >= 1 ? "#34d399" : "rgb(var(--brand-rgb))"} />
            <div className="text-center">
              <div className="text-sm text-fg">{money(wonThisMonth, m.currency)} <span className="text-muted">/ {compactMoney(org.monthlyQuota, m.currency)}</span></div>
              <div className="text-xs text-muted">{attainment >= 1 ? "Goal reached" : `${money(Math.max(0, org.monthlyQuota - wonThisMonth), m.currency)} to go`}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Pipeline funnel" className="lg:col-span-2" action={<Link href="/pipeline" className="text-sm text-brand hover:underline">Board →</Link>}>
          <Funnel stages={reports.funnel} />
        </Card>

        <Card title="Recall this week" action={<Link href="/recall" className="text-sm text-brand hover:underline">All →</Link>}>
          {o.recall.length === 0 ? (
            <p className="text-sm text-muted">Nothing slipping — your pipeline is well tended.</p>
          ) : (
            <ul className="space-y-3">
              {o.recall.slice(0, 4).map((r) => (
                <li key={r.opportunityId}>
                  <Link href={`/deals/${r.opportunityId}`} className="block rounded-lg border border-border bg-surface-2 p-3 transition hover:border-brand/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-fg">{r.title}</span>
                      <ScoreDot score={r.score} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <ReasonBadge reason={r.reason} />
                      <span className="text-xs text-muted">{money(r.weightedValue, r.currency)} · {relativeDays(r.daysSinceActivity)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {reports.recallOutcomes.wonBack > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
              <span className="text-muted">Won back so far</span>
              <span className="font-medium text-success">{money(reports.recallOutcomes.recoveredValue, m.currency)} · {reports.recallOutcomes.wonBack} deals</span>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Recent activity" className="lg:col-span-2">
          {feed.length === 0 && <p className="py-6 text-center text-sm text-muted">No activity yet — it shows up here as the agent works your deals.</p>}
          <ul className="space-y-1">
            {feed.map((f) => (
              <li key={f.activity.id} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-2/50">
                <ActivityIcon kind={f.activity.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{f.activity.summary}</p>
                  <p className="truncate text-xs text-muted">{f.contactName ?? f.dealTitle ?? ""}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(f.activity.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Leaderboard">
          <ul className="space-y-3">
            {reports.leaderboard.map((row, i) => (
              <li key={row.name} className="flex items-center gap-3">
                <span className="w-4 text-center text-sm font-semibold text-muted">{i + 1}</span>
                <Avatar name={row.name} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{row.name}</p>
                  <p className="text-xs text-muted">{row.won} won</p>
                </div>
                <span className="text-sm tabular-nums text-fg">{compactMoney(row.value, m.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
