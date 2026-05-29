export interface SetupItem {
  label: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

/**
 * Go-live readiness, in-product. Shows what's connected and what's still needed
 * before sending to real customers — required items first. Pure presentational;
 * the settings page computes the statuses server-side.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const required = items.filter((i) => i.required);
  const readyCount = required.filter((i) => i.ok).length;
  const allRequiredReady = readyCount === required.length;

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${allRequiredReady ? "border-success/40 bg-success/10" : "border-warn/40 bg-warn/10"}`}>
        <p className="text-sm font-medium text-fg">
          {allRequiredReady ? "Ready to sell to real customers" : `Setup ${readyCount}/${required.length} required steps complete`}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {allRequiredReady
            ? "All required connections are live. Optional steps below can sharpen things further."
            : "Connect the required items below before sending real outreach."}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.label} className="flex items-start justify-between gap-3 py-3">
            <div>
              <span className="text-sm text-fg">
                {i.label}
                {i.required && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">required</span>}
              </span>
              <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
            </div>
            <span className={`pill shrink-0 ${i.ok ? "bg-success/15 text-success" : i.required ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted"}`}>
              {i.ok ? "Connected" : i.required ? "Needed" : "Optional"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
