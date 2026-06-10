// Matches Meetings: header + grouped booking sections (heading + rows).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2/70" />
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <div className="h-5 w-32 rounded bg-surface-2" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-2" />
          ))}
        </div>
      ))}
    </div>
  );
}
