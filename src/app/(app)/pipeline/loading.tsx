export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-40 rounded bg-surface-2" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, c) => (
          <div key={c} className="w-64 shrink-0 space-y-3">
            <div className="h-5 w-28 rounded bg-surface-2" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-surface-2" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
