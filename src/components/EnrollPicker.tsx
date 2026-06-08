"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop a single deal or contact into a follow-up sequence from its own page.
 * `scope` is the cadence vocabulary (deal:<id> | contact:<id>); the server skips
 * anyone already enrolled and reports how many were added.
 */
export function EnrollPicker({ scope, sequences }: { scope: string; sequences: { id: string; name: string }[] }) {
  const router = useRouter();
  const [seqId, setSeqId] = useState(sequences[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function enroll() {
    if (!seqId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: seqId, scope }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't enroll.");
      const enrolled = typeof b.enrolled === "number" ? b.enrolled : 1;
      setMsg({ ok: true, text: enrolled === 0 ? "Already in this sequence." : "Added — follow-ups will send automatically." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't enroll." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={seqId}
          onChange={(e) => setSeqId(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        >
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={enroll}
          disabled={busy || !seqId}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-fg transition hover:border-brand disabled:opacity-50"
        >
          {busy ? "Adding…" : "Enroll"}
        </button>
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
