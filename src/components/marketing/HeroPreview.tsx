const RECALL = [
  { name: "Northwind — Renewal", reason: "Going cold", value: "$24K", score: 92, tone: "bg-warn" },
  { name: "Cedar Realty — Listing", reason: "Winnable loss", value: "$18K", score: 81, tone: "bg-brand" },
  { name: "Vertex Group — Expansion", reason: "Stalled", value: "$31K", score: 76, tone: "bg-danger" },
  { name: "Harborline — New deal", reason: "Untouched", value: "$9K", score: 64, tone: "bg-muted" },
];

export function HeroPreview() {
  return (
    <div className="ring-glow animate-float overflow-hidden rounded-2xl border border-border bg-surface">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-danger/70" />
        <span className="h-3 w-3 rounded-full bg-warn/70" />
        <span className="h-3 w-3 rounded-full bg-success/70" />
        <span className="ml-3 text-xs text-muted">Revenue Recall — Dashboard</span>
      </div>

      <div className="space-y-4 p-5">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Recoverable", value: "$82,400", tone: "text-warn" },
            { label: "Weighted forecast", value: "$214K", tone: "text-fg" },
            { label: "Win rate", value: "41%", tone: "text-success" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface-2/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">{s.label}</p>
              <p className={`mt-1 text-lg font-semibold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* recall list */}
        <div className="rounded-xl border border-border bg-surface-2/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-fg">Revenue Recall queue</span>
            <span className="pill bg-brand-soft text-brand">4 at risk</span>
          </div>
          <div className="space-y-1.5">
            {RECALL.map((r) => (
              <div key={r.name} className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.tone}`} />
                  <span className="tabular-nums text-xs text-fg">{r.score}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.name}</span>
                <span className="hidden text-[11px] text-muted sm:inline">{r.reason}</span>
                <span className="text-sm font-medium tabular-nums text-brand">{r.value}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Working</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
