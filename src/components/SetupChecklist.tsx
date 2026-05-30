import { Icon } from "@/components/icons";

export interface SetupItem {
  label: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

/**
 * Go-live readiness, in-product. A launch console: a progress ring over the
 * required steps, then every connection with a clear status. Required items
 * first. Pure presentational; the settings page computes statuses server-side.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const required = items.filter((i) => i.required);
  const readyCount = required.filter((i) => i.ok).length;
  const allRequiredReady = readyCount === required.length;
  const pct = required.length > 0 ? readyCount / required.length : 1;

  // Progress ring geometry.
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="space-y-5">
      <div className={`raised flex items-center gap-4 rounded-2xl border p-5 ${allRequiredReady ? "border-success/40 bg-success/[0.06]" : "border-brand/30 bg-brand-soft/10"}`}>
        <div className="relative grid flex-none place-items-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--border-rgb))" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={allRequiredReady ? "#34d399" : "rgb(var(--brand-rgb))"}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circ * pct} ${circ}`}
              className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
            />
          </svg>
          <span className="absolute grid place-items-center">
            {allRequiredReady ? (
              <Icon name="approvals" size={22} className="text-success" />
            ) : (
              <span className="font-display text-sm font-semibold tabular-nums text-fg">{readyCount}/{required.length}</span>
            )}
          </span>
        </div>
        <div>
          <p className="font-display text-base font-semibold tracking-tight text-fg">
            {allRequiredReady ? "Ready to sell to real customers" : "Finish setup to go live"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {allRequiredReady
              ? "All required connections are live. The optional steps below sharpen things further."
              : `${readyCount} of ${required.length} required connections done — finish the rest before sending real outreach.`}
          </p>
        </div>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-border">
        {items.map((i, idx) => (
          <li key={i.label} className={`flex items-start justify-between gap-3 bg-surface px-4 py-3.5 ${idx > 0 ? "border-t border-border" : ""}`}>
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full ${
                  i.ok ? "bg-success/15 text-success" : i.required ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted"
                }`}
              >
                {i.ok ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                ) : i.required ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                )}
              </span>
              <div>
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  {i.label}
                  {i.required && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">required</span>}
                </span>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.detail}</p>
              </div>
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
