// Matches Tasks: header + a stacked list of next-action rows.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-28 rounded bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
