import { getForecast } from "@/lib/queries";
import { compactMoney, money } from "@/lib/format";
import { PageHeader, Stat, Card, EmptyState, Button } from "@/components/ui";
import { MiniLegendBar, ProgressRing } from "@/components/charts";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const f = await getForecast();
  const attainment = f.quota > 0 ? f.weighted / f.quota : 0;
  const maxStage = Math.max(1, ...f.byStage.map((s) => s.value));

  // No open deals yet → a wall of $0 reads as "broken", not "empty". Guide instead.
  if (f.byStage.every((s) => s.count === 0)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Forecast" subtitle="Where revenue will land — commit, best case, and full pipeline." />
        <EmptyState
          iconName="forecast"
          title="No forecast yet"
          hint="Your weighted forecast appears here once you have open deals — we project where revenue lands across commit, best case, and full pipeline. Import your leads or add a deal to get started."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button href="/settings?tab=import">Import leads</Button>
              <Button href="/leads" variant="outline">View leads</Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Forecast" subtitle="Where revenue will land — commit, best case, and full pipeline." />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Commit" value={money(f.commit, f.currency)} tone="success" hint="≥80% probability" />
        <Stat label="Best Case" value={money(f.commit + f.bestCase, f.currency)} hint="commit + likely" />
        <Stat label="Weighted" value={money(f.weighted, f.currency)} hint="probability-adjusted" />
        <Stat label="Total Pipeline" value={money(f.commit + f.bestCase + f.pipeline, f.currency)} hint="all open deals" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Forecast categories" className="lg:col-span-2">
          <MiniLegendBar segments={f.categories.map((c) => ({ label: `${c.label} · ${c.count}`, value: c.value, color: c.color }))} />
          <div className="mt-5 space-y-3">
            {f.byStage.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-muted">{s.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-surface-2">
                  <div className="h-full rounded bg-brand/70" style={{ width: `${(s.value / maxStage) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-fg">{compactMoney(s.value, f.currency)}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Quota coverage">
          <div className="flex flex-col items-center gap-3 py-2">
            <ProgressRing value={attainment} size={120} thickness={11} color={attainment >= 1 ? "#34d399" : "rgb(var(--brand-rgb))"} />
            <div className="text-center">
              <div className="text-sm text-fg">{money(f.weighted, f.currency)} <span className="text-muted">/ {compactMoney(f.quota, f.currency)}</span></div>
              <div className="text-xs text-muted">weighted pipeline vs. quota (not closed-won — see the dashboard goal for that)</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
