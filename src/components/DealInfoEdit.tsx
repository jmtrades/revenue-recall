"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

type Fields = { title: string; value: string; expectedCloseAt: string; ownerId: string };

/**
 * Inline editor for a deal's core fields (title / value / expected close /
 * owner). A wrong value silently skews pipeline + forecast totals, and a deal
 * stuck on the wrong rep never gets worked; this fixes both in place. Stage
 * moves and activity logging keep their own controls.
 */
export function DealInfoEdit({
  dealId,
  initial,
  currency,
  owners = [],
}: {
  dealId: string;
  initial: { title: string; value: number; expectedCloseAt: string; ownerId?: string };
  currency: string;
  /** The org's members, for reassignment. Empty → the owner select is hidden. */
  owners?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const reset = () => ({ title: initial.title, value: String(initial.value), expectedCloseAt: initial.expectedCloseAt, ownerId: initial.ownerId ?? "" });
  const [f, setF] = useState<Fields>(reset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = Number(f.value);
    if (!f.title.trim() || Number.isNaN(value) || value < 0 || busy) {
      setError("Enter a title and a value of 0 or more.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim(),
          value,
          ...(f.expectedCloseAt ? { expectedCloseAt: f.expectedCloseAt } : {}),
          // Send only on change; "" unassigns.
          ...(f.ownerId !== (initial.ownerId ?? "") ? { ownerId: f.ownerId } : {}),
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't save the changes.");
      setEditing(false);
      toast("Changes saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the changes.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="mt-3 text-xs text-brand hover:underline">Edit deal</button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="stat-label">Title</span>
        <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Deal title" />
      </label>
      <label className="block">
        <span className="stat-label">Value ({currency})</span>
        <input type="number" min={0} step="any" className={input} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} aria-label="Deal value" />
      </label>
      <label className="block">
        <span className="stat-label">Expected close</span>
        <input type="date" className={input} value={f.expectedCloseAt} onChange={(e) => setF({ ...f, expectedCloseAt: e.target.value })} aria-label="Expected close date" />
      </label>
      {owners.length > 0 && (
        <label className="block">
          <span className="stat-label">Owner</span>
          <select className={input} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} aria-label="Deal owner">
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={busy || !f.title.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setF(reset()); setError(null); setEditing(false); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  );
}
