// Matches Go Live: header + headline status card + the readiness checklist +
// the activity feed, so navigation doesn't flash blank.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-2/70" />
      </div>
      {/* Headline status card */}
      <div className="h-28 rounded-2xl bg-surface-2" />
      {/* Readiness checklist */}
      <div className="space-y-3 rounded-2xl bg-surface-2 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-surface/60" />
        ))}
      </div>
      {/* Activity feed */}
      <div className="h-48 rounded-2xl bg-surface-2" />
    </div>
  );
}
