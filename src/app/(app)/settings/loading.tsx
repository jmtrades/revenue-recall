// Matches Settings: header + the tab rail + stacked setting cards.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
