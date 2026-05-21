"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@/lib/crm/types";

const KINDS: { id: "note" | "call" | "email" | "sms" | "meeting"; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "meeting", label: "Meeting" },
];

export function DealActions({ dealId, stages, currentStageId, canWrite }: { dealId: string; stages: Stage[]; currentStageId: string; canWrite: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("note");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(stageId: string) {
    setError(null);
    const res = await fetch(`/api/opportunities/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Move failed");
    else startTransition(() => router.refresh());
  }

  async function log() {
    if (!summary.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${dealId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, summary }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      setSummary("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="stat-label">Stage</label>
        <select
          value={currentStageId}
          disabled={!canWrite}
          onChange={(e) => move(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand disabled:opacity-60"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="stat-label">Log activity</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-lg px-2.5 py-1 text-xs ${kind === k.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-white"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What happened?"
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand"
        />
        <button
          onClick={log}
          disabled={busy || !summary.trim()}
          className="mt-2 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Log activity"}
        </button>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
