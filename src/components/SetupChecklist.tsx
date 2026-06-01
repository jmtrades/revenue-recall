import { Icon } from "@/components/icons";

export interface SetupItem {
  label: string;
  ok: boolean;
  detail: string;
  required: boolean;
  /** Can't be auto-detected (e.g. a Supabase dashboard toggle) → shown as a reminder, not counted. */
  manual?: boolean;
  /** Where you do it: "Vercel" | "Stripe" | "Supabase" | "Resend" … */
  where?: string;
  /** Exact steps, shown until the item is done. */
  steps?: string[];
  /** Optional deep link (docs / dashboard). */
  link?: { href: string; label: string };
}

/**
 * Go-live readiness, in-product. A launch console: a progress ring over the
 * required steps, then every connection with a clear status AND the exact steps
 * to finish the ones that aren't done yet. Pure presentational; the settings
 * page computes statuses server-side.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const required = items.filter((i) => i.required && !i.manual);
  const readyCount = required.filter((i) => i.ok).length;
  const allRequiredReady = readyCount === required.length;
  const pct = required.length > 0 ? readyCount / required.length : 1;

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
              ? "All required connections are live. The steps below sharpen things further."
              : `${readyCount} of ${required.length} required connections done — follow the steps on each to finish.`}
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {items.map((i) => {
          const showSteps = (!i.ok || i.manual) && i.steps && i.steps.length > 0;
          const pill = i.ok ? "Connected" : i.manual ? "Check this" : i.required ? "Needed" : "Optional";
          const pillClass = i.ok ? "bg-success/15 text-success" : i.manual ? "bg-brand-soft text-brand" : i.required ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted";
          const dotClass = i.ok ? "bg-success/15 text-success" : i.manual ? "bg-brand-soft text-brand" : i.required ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted";
          return (
            <li key={i.label} className="rounded-2xl border border-border bg-surface px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full ${dotClass}`}>
                    {i.ok ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : i.manual ? (
                      <span className="text-[12px] font-bold">!</span>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <div>
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      {i.label}
                      {i.required && !i.manual && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">required</span>}
                      {i.where && <span className="pill bg-surface-2 text-[10px] text-muted">{i.where}</span>}
                    </span>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.detail}</p>
                  </div>
                </div>
                <span className={`pill shrink-0 ${pillClass}`}>{pill}</span>
              </div>

              {showSteps && (
                <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3">
                  <ol className="space-y-1.5">
                    {i.steps!.map((s, n) => (
                      <li key={s} className="flex gap-2.5 text-xs leading-relaxed text-body">
                        <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-brand/15 text-[10px] font-semibold text-brand">{n + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  {i.link && (
                    <a href={i.link.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                      {i.link.label}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-center text-xs text-muted">
        Live status updates automatically. Secrets go in your Vercel / Stripe / Supabase dashboards — never here.
      </p>
    </div>
  );
}
