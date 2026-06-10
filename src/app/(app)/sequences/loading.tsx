// Matches Sequences: header + a responsive grid of cadence cards.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
