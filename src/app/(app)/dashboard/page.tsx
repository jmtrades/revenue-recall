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

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// The dial-pace target — the Operator plan sells ~100 dials a day, so that's
// the bar the pulse measures against. A motivational pace cue, not a gate.
const DAILY_DIAL_GOAL = 100;

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return relativeDays(days);
}

function partOfDay(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
        subtitle={o.recallSummary.itemCount > 0 ? "Here's where your revenue stands — and what's slipping out of the pipeline." : "Your pipeline is well tended — here's where things stand today."}
      />

      {/* Recoverable-revenue hero — the product's North Star. Lead with the money
          dying in the pipeline and the single action that recovers it, rather than
          burying it as one of four equal stats. Calm, reassuring state when there's
          nothing slipping. */}
      {o.recallSummary.itemCount > 0 ? (
        <Link href="/recall" className="group relative block overflow-hidden rounded-2xl border border-warn/30 bg-surface p-6 transition hover:border-warn/55">
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warn/10 via-transparent to-transparent" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warn"><Icon name="recall" size={14} /> Recoverable revenue</span>
              <div className="mt-2 font-display text-[2.75rem] font-semibold leading-none tabular-nums tracking-tight text-fg">{money(o.recallSummary.totalRecoverable, m.currency)}</div>
              <p className="mt-2 text-sm text-muted">Slipping across {o.recallSummary.itemCount} at-risk {o.recallSummary.itemCount === 1 ? "deal" : "deals"} — recover it before it&apos;s gone.</p>
            </div>
            <span className="inline-flex flex-none items-center gap-2 rounded-xl bg-warn px-5 py-3 text-sm font-semibold text-white transition group-hover:brightness-110">
              <Icon name="recall" size={16} /> Work the recall queue <span aria-hidden>→</span>
            </span>
          </div>
          {reports.recallOutcomes.wonBack > 0 && (
            <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-warn/15 pt-3 text-sm">
              <Icon name="reports" size={13} className="text-success" />
              <span className="text-muted">Already won back</span>
              <span className="font-semibold text-success">{money(reports.recallOutcomes.recoveredValue, m.currency)}</span>
              <span className="text-muted">· {reports.recallOutcomes.wonBack} {reports.recallOutcomes.wonBack === 1 ? "deal" : "deals"}</span>
            </div>
          )}
        </Link>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-success/25 bg-surface p-5">
          <span className="inline-flex items-center gap-2.5 text-sm text-body">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-success/15 text-success"><Icon name="reports" size={18} /></span>
            Your pipeline is well tended — nothing slipping today.
          </span>
          <Button href="/dialer" variant="outline"><Icon name="dialer" size={15} /> Start calling</Button>
        </div>
      )}

      {o.dialsToday > 0 && (
        <Link href="/dialer" className="group flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-3.5 transition hover:border-brand/40">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="dialer" size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg font-semibold tabular-nums text-fg">{o.dialsToday}</span>
              <span className="text-sm text-muted">dial{o.dialsToday === 1 ? "" : "s"} today{o.dialsToday >= DAILY_DIAL_GOAL ? " — goal hit 🎯" : ` of ${DAILY_DIAL_GOAL}`}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.min(100, Math.round((o.dialsToday / DAILY_DIAL_GOAL) * 100))}%` }} />
            </div>
          </div>
          <span className="hidden shrink-0 text-sm font-medium text-brand group-hover:underline sm:block">Keep dialing →</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open Pipeline" value={money(m.openValue, m.currency)} hint={`${m.openCount} open ${o.terminology.opportunity.toLowerCase()}s`} icon="pipeline" countUp />
        <Stat label="Weighted Forecast" value={money(m.weightedForecast, m.currency)} hint="probability-adjusted" icon="forecast" countUp />
        <Stat label="Won This Month" value={money(wonThisMonth, m.currency)} hint="closed-won" tone="success" icon="approvals" countUp />
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
