// Inbox is a 2-pane layout (thread list + conversation), so the generic
// dashboard skeleton from (app)/loading.tsx mismatches it. This one fits.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-32 rounded bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface-2" />
          ))}
        </div>
        <div className="hidden h-[60vh] rounded-xl bg-surface-2 lg:block" />
      </div>
    </div>
  );
}
