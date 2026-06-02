"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Your-data controls (GDPR/CCPA): export everything, or permanently delete the
 * account. Delete requires typing DELETE and is irreversible, so it's gated
 * behind a reveal + confirmation.
 */
export function DataRights() {
  const [confirming, setConfirming] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Couldn't delete the account.");
      }
      window.location.href = "/login";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="shield" size={16} className="text-brand" /> Your data</h2>
      <p className="mt-1 text-sm text-muted">Export everything in your workspace, or permanently delete your account. Your data is yours.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/api/user/export"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg transition hover:bg-surface-2"
        >
          <Icon name="database" size={15} /> Export my data (JSON)
        </a>
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="text-sm font-medium text-danger transition hover:underline">
            Delete my account…
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-fg">This permanently erases your account{""} — and, if you own this workspace, all of its contacts, deals, and history. This can&apos;t be undone.</p>
            <p className="text-xs text-muted">Type <span className="font-mono font-semibold text-fg">DELETE</span> to confirm.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-36 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-danger"
              />
              <button
                onClick={remove}
                disabled={busy || confirm !== "DELETE"}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition hover:bg-danger/90 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
              <button onClick={() => { setConfirming(false); setConfirm(""); setError(null); }} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg">
                Cancel
              </button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
