// Contact detail is a header + 3-column layout (side info + deals/activity),
// not the 4-stat dashboard the root skeleton renders — this matches it.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-surface-2" />
        <div className="h-8 w-56 rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-surface-2" />
          ))}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="h-32 rounded-xl bg-surface-2" />
          <div className="h-48 rounded-xl bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
