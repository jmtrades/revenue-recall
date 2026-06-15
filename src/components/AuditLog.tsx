"use client";

import { useState } from "react";
import { useResource } from "@/lib/useResource";

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
  "member.role_changed": "Changed a member's role",
  "member.removed": "Removed a member",
  "billing.checkout_started": "Started checkout",
  "billing.portal_opened": "Opened billing portal",
  "org.settings_updated": "Updated workspace settings",
};
const labelFor = (a: string) => LABELS[a] ?? a;

/** Account activity trail. The /api/audit endpoint is owner/admin-gated, so for
 *  a rep it returns 403 and this renders nothing. Fetched via useResource, which
 *  aborts on unmount and ignores stale responses. */
export function AuditLog() {
  const [forbidden, setForbidden] = useState(false);
  const { data: events, loading } = useResource<Event[]>(
    "/api/audit",
    (json) => (json as { events?: Event[] }).events ?? [],
    {
      onStatus: (s) => {
        if (s === 403 || s === 401) {
          setForbidden(true);
          return true; // handled — render nothing
        }
        return false;
      },
    },
  );

  if (forbidden) return null;

  return (
    <div className="space-y-2">
      <p className="stat-label">Audit log</p>
      <p className="text-xs text-muted">Recent account activity — invites, billing, and workspace settings changes.</p>
      {loading || events === null ? (
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
