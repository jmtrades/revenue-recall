// Deal detail is a header + 3-column layout (timeline + side cards), not the
// 4-stat dashboard the root skeleton renders — this matches it.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="h-9 w-72 rounded bg-surface-2" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-72 rounded-xl bg-surface-2" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
