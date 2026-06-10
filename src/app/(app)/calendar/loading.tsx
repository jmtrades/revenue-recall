// Matches Calendar: header + a month grid (weekday row + day cells) beside an agenda column.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-5 rounded bg-surface-2" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-surface-2" />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
