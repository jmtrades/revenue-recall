import Link from "next/link";
import { getOverview } from "@/lib/queries";
import { compactMoney, money, pct, relativeDays } from "@/lib/format";
import { PageHeader, Stat, ReasonBadge, ScoreDot } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const o = await getOverview();
  const m = o.metrics;
  const topRecall = o.recall.slice(0, 5);

  const maxBucket = Math.max(1, ...m.buckets.filter((b) => b.stage.type === "open").map((b) => b.value));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${o.industryLabel} · connected to ${o.providerLabel}`}
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Open Pipeline" value={money(m.openValue, m.currency)} hint={`${m.openCount} open ${o.terminology.opportunity.toLowerCase()}s`} />
        <Stat label="Weighted Forecast" value={money(m.weightedForecast, m.currency)} hint="probability-adjusted" />
        <Stat label="Recoverable Revenue" value={money(o.recallSummary.totalRecoverable, m.currency)} hint={`${o.recallSummary.itemCount} at-risk deals`} tone="warn" />
        <Stat label="Win Rate" value={pct(m.winRate)} hint={`${m.wonCount} won · ${m.lostCount} lost`} tone="success" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Pipeline by stage</h2>
            <Link href="/pipeline" className="text-sm text-brand hover:underline">Open board →</Link>
          </div>
          <div className="space-y-3">
            {m.buckets
              .filter((b) => b.stage.type === "open")
              .map((b) => (
                <div key={b.stage.id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-muted">{b.stage.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-surface-2">
                    <div className="h-full rounded bg-brand/70" style={{ width: `${(b.value / maxBucket) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-white">{compactMoney(b.value, m.currency)}</span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{b.count}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Recall this week</h2>
            <Link href="/recall" className="text-sm text-brand hover:underline">All →</Link>
          </div>
          {topRecall.length === 0 ? (
            <p className="text-sm text-muted">Nothing slipping — your pipeline is well tended.</p>
          ) : (
            <ul className="space-y-3">
              {topRecall.map((r) => (
                <li key={r.opportunityId} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-white">{r.title}</span>
                    <ScoreDot score={r.score} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <ReasonBadge reason={r.reason} />
                    <span className="text-xs text-muted">{money(r.weightedValue, r.currency)} · {relativeDays(r.daysSinceActivity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
