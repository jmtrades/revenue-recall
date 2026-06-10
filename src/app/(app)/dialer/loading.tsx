// Matches Power Dialer: header + a call queue beside the active-call panel.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded bg-surface-2/70" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface-2" />
          ))}
        </div>
        <div className="h-[28rem] rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
