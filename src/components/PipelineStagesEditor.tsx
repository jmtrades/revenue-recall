"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface StageView {
  id: string;
  label: string;
  probability: number;
  type: "open" | "won" | "lost";
}

/**
 * Inline pipeline-stage editor: rename, set win probability, reorder, add, and
 * delete (empty, open stages only — the API enforces the same rules). Rendered
 * only for owner/admin on Supabase-backed workspaces; everyone else sees the
 * read-only list.
 */
export function PipelineStagesEditor({ stages }: { stages: StageView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [prob, setProb] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the change.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Couldn't save the change — check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: StageView) {
    setEditingId(s.id);
    setLabel(s.label);
    setProb(String(Math.round(s.probability * 100)));
    setError(null);
  }

  async function saveEdit(id: string) {
    const probability = Number(prob) / 100;
    if (!label.trim() || Number.isNaN(probability) || probability < 0 || probability > 1) {
      setError("Enter a name and a win % between 0 and 100.");
      return;
    }
    if (await call(`/api/stages/${id}`, { method: "PATCH", body: JSON.stringify({ label: label.trim(), probability }) })) {
      setEditingId(null);
    }
  }

  async function add() {
    if (!newLabel.trim()) return;
    if (await call("/api/stages", { method: "POST", body: JSON.stringify({ label: newLabel.trim() }) })) {
      setNewLabel("");
    }
  }

  const input = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-brand";
  const iconBtn = "rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-40";

  return (
    <div>
      <ul className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            {editingId === s.id ? (
              <span className="flex flex-1 items-center gap-2">
                <input className={`${input} flex-1`} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Stage name" />
                <input className={`${input} w-20`} type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} aria-label="Win probability %" />
                <span className="text-xs text-muted">%</span>
                <button onClick={() => saveEdit(s.id)} disabled={busy} className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-muted hover:text-fg">Cancel</button>
              </span>
            ) : (
              <>
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.type === "won" ? "bg-success" : s.type === "lost" ? "bg-danger" : "bg-brand"}`} />
                  <span className="text-sm text-fg">{s.label}</span>
                  <span className="pill bg-surface text-muted">{s.type}</span>
                  <span className="text-xs tabular-nums text-muted">{Math.round(s.probability * 100)}% win</span>
                </span>
                <span className="flex items-center gap-1">
                  <button onClick={() => call(`/api/stages/${s.id}`, { method: "PATCH", body: JSON.stringify({ direction: "up" }) })} disabled={busy || i === 0} aria-label={`Move ${s.label} up`} className={iconBtn}>↑</button>
                  <button onClick={() => call(`/api/stages/${s.id}`, { method: "PATCH", body: JSON.stringify({ direction: "down" }) })} disabled={busy || i === stages.length - 1} aria-label={`Move ${s.label} down`} className={iconBtn}>↓</button>
                  <button onClick={() => startEdit(s)} disabled={busy} className={iconBtn}>Edit</button>
                  {s.type === "open" && (
                    <button
                      onClick={() => { if (window.confirm(`Delete the "${s.label}" stage? Only possible while no deals are on it.`)) void call(`/api/stages/${s.id}`, { method: "DELETE" }); }}
                      disabled={busy}
                      className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <input
          className={`${input} flex-1`}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          placeholder="Add a stage (e.g. Demo scheduled)"
          aria-label="New stage name"
        />
        <button onClick={add} disabled={busy || !newLabel.trim()} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          Add stage
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <p className="mt-2 text-[11px] text-muted">Win % feeds the weighted forecast. Won and Lost are built-in outcomes; a stage must be empty to delete it.</p>
    </div>
  );
}
