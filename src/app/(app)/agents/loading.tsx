// Matches Autopilot: header + a run-summary stat row + task cards beside the guardrails panel.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-surface-2" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
