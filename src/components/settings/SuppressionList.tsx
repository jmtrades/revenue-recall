"use client";

import { useEffect, useState } from "react";
import type { SuppressedRow } from "@/lib/suppression";

/**
 * Settings → Deliverability → suppression. Shows who the engine won't contact
 * (opted out / bounced) and lets an owner/admin manually suppress or restore an
 * address. Self-fetches so the settings page load stays light.
 */
const REASON_LABEL: Record<string, string> = { opted_out: "Opted out", bounced: "Bounced" };

export function SuppressionList({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<SuppressedRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/suppression");
      const body = (await res.json().catch(() => ({}))) as { suppressed?: SuppressedRow[] };
      setRows(body.suppressed ?? []);
    } catch {
      setRows([]);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function mutate(method: "POST" | "DELETE", addr: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/suppression", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: addr }) });
      const body = (await res.json().catch(() => ({}))) as { flagged?: number; restored?: number; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update suppression.");
        return;
      }
      if (method === "POST") setNote(body.flagged ? `Suppressed ${body.flagged} contact(s).` : "No matching contact found for that email.");
      else setNote(body.restored ? `Restored ${body.restored} contact(s).` : "No suppressed contact found for that email.");
      await load();
    } catch {
      setError("Couldn't update — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-fg">Suppressed contacts</h2>
      <p className="mt-1 text-sm text-muted">People the engine will never email or message — because they opted out or their email hard-bounced. Keeping these out protects your sender reputation.</p>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
            aria-label="Email to suppress"
          />
          <button onClick={() => email.trim() && mutate("POST", email.trim())} disabled={busy || !email.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
            Suppress
          </button>
          {note && <span className="text-xs text-muted">{note}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}

      <div className="mt-4">
        {rows === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No suppressed contacts. 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.contactId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm text-fg">{r.name}</span>
                  {r.email && <span className="ml-2 text-xs text-muted">{r.email}</span>}
                  <span className="ml-2 inline-flex gap-1">
                    {r.reasons.map((reason) => (
                      <span key={reason} className={`pill ${reason === "bounced" ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted"}`}>
                        {REASON_LABEL[reason] ?? reason}
                      </span>
                    ))}
                  </span>
                </div>
                {canManage && r.email && (
                  <button onClick={() => mutate("DELETE", r.email!)} disabled={busy} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
