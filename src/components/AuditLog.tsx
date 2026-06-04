"use client";

import { useEffect, useState } from "react";

interface Event {
  id: string;
  action: string;
  target?: string;
  actorEmail?: string;
  createdAt: string;
}

const LABELS: Record<string, string> = {
  "invite.created": "Invited teammate(s)",
  "invite.revoked": "Revoked an invite",
  "billing.checkout_started": "Started checkout",
  "billing.portal_opened": "Opened billing portal",
  "org.settings_updated": "Updated workspace settings",
};
const labelFor = (a: string) => LABELS[a] ?? a;

/** Account activity trail. The /api/audit endpoint is owner/admin-gated, so for
 *  a rep it returns 403 and this renders nothing. */
export function AuditLog() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) {
          setForbidden(true);
          return;
        }
        if (!r.ok) return;
        const d = (await r.json()) as { events?: Event[] };
        setEvents(d.events ?? []);
      })
      .catch(() => undefined);
  }, []);

  if (forbidden) return null;

  return (
    <div className="space-y-2">
      <p className="stat-label">Audit log</p>
      <p className="text-xs text-muted">Recent account activity — invites, billing, and workspace settings changes.</p>
      {events === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-fg">
                {labelFor(e.action)}
                {e.target ? <span className="text-muted"> · {e.target}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {e.actorEmail ?? "system"} · {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
