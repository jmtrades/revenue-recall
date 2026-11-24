import type { WebinarConnectRow } from "@/lib/webinar/install";

/** Copy-paste webhook URLs and the beacon snippet for every platform. */
export function WebinarSetup({ secret, rows }: { secret: string | null; rows: WebinarConnectRow[] }) {
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-semibold text-fg">Webinar drop-off</h2>
      <p className="mt-1 text-sm text-muted">
        Every platform below is armed on this host. Paste the webhook into the platform, Zapier, or Make.
        Paste the beacon on a page you control when the platform has no leave event. Zoom, YouTube, and StreamYard
        cannot run the snippet inside their own room.
      </p>
      {secret ? (
        <p className="mt-3 text-sm text-fg">
          Shared secret <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{secret}</code>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Set WEBINAR_WEBHOOK_SECRET on the host to arm these URLs.</p>
      )}
      <ul className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-fg">{row.label}</span>
              <span className={`pill ${row.armed ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{row.armed ? "Armed" : "Not armed"}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{row.latency}</p>
            {row.webhookUrl ? (
              <label className="mt-2 block text-xs text-muted">
                Webhook
                <input readOnly value={row.webhookUrl} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-fg" />
              </label>
            ) : null}
            {row.snippet ? (
              <label className="mt-2 block text-xs text-muted">
                Beacon snippet
                <textarea readOnly value={row.snippet} rows={5} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-fg" />
              </label>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
