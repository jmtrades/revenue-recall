"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoRow } from "@/components/ui";

type Fields = { name: string; company: string; title: string; email: string; phone: string };

/**
 * Contact info with inline editing. The backend (updateContactRecord) and even
 * the public API already support editing a contact — this gives the in-app user
 * the same, so a typo'd email or a changed phone can be fixed without leaving.
 */
export function ContactInfoEdit({
  contactId,
  points,
  initial,
  canWrite,
}: {
  contactId: string;
  points: { channel: string; value: string }[];
  initial: Fields;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Fields>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, name: f.name.trim(), company: f.company.trim(), title: f.title.trim(), email: f.email.trim(), phone: f.phone.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't save the changes.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the changes.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  if (editing) {
    return (
      <div className="space-y-2">
        <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" aria-label="Name" />
        <input className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" aria-label="Email" />
        <input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" aria-label="Phone" />
        <input className={input} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Company" aria-label="Company" />
        <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" aria-label="Title" />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={busy || !f.name.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setF(initial); setError(null); setEditing(false); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {points.length > 0 ? points.map((p, i) => <InfoRow key={i} label={p.channel}>{p.value}</InfoRow>) : <p className="text-sm text-muted">No contact details yet.</p>}
      {canWrite && (
        <button onClick={() => setEditing(true)} className="mt-3 text-xs text-brand hover:underline">Edit contact</button>
      )}
    </div>
  );
}
