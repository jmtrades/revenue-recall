export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-32 rounded bg-surface-2" />
      <div className="h-10 w-full max-w-sm rounded-lg bg-surface-2" />
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
