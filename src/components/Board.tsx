"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";
import { compactMoney } from "@/lib/format";
import { Avatar } from "@/components/ui";

interface Props {
  pipeline: Pipeline;
  opportunities: Opportunity[];
  contacts: Record<string, Pick<Contact, "name" | "company">>;
  owners: Record<string, string>;
  canWrite: boolean;
}

export function Board({ pipeline, opportunities, contacts, owners, canWrite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(opportunities);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = pipeline.stages;

  async function commitMove(id: string, stageId: string) {
    const prev = items;
    setItems((cur) => cur.map((o) => (o.id === id ? { ...o, stageId } : o)));
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Move failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }

  function onDrop(stageId: string) {
    setOverStage(null);
    if (dragId) {
      const opp = items.find((o) => o.id === dragId);
      if (opp && opp.stageId !== stageId) commitMove(dragId, stageId);
    }
    setDragId(null);
  }

  return (
    <div>
      {error && <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {/* On a phone each stage fills ~80% of the screen (the next one peeks, so
          it's clearly swipeable); from sm: up it's the full 230px column. */}
      <div className={`grid gap-3 ${pending ? "opacity-70" : ""}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(min(80vw, 230px), 1fr))` }}>
        {columns.map((stage) => {
          const colItems = items.filter((o) => o.stageId === stage.id);
          const total = colItems.reduce((s, o) => s + o.value, 0);
          const tone = stage.type === "won" ? "text-success" : stage.type === "lost" ? "text-danger" : "text-fg";
          const dot = stage.type === "won" ? "bg-success" : stage.type === "lost" ? "bg-danger" : "bg-brand";
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => onDrop(stage.id)}
              className={`flex min-w-0 flex-col rounded-xl border bg-surface transition ${overStage === stage.id ? "border-brand bg-brand-soft/20" : "border-border"}`}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className={`flex items-center gap-2 truncate text-sm font-medium ${tone}`}>
                  <span className={`h-1.5 w-1.5 flex-none rounded-full ${dot}`} />
                  {stage.label}
                </span>
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-xs tabular-nums text-muted">{colItems.length}</span>
              </div>
              <div className="px-3 py-1 text-xs tabular-nums text-muted">{compactMoney(total, colItems[0]?.currency ?? "USD")}</div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {colItems.map((o) => {
                  const c = contacts[o.contactId];
                  return (
                    <div
                      key={o.id}
                      draggable={canWrite}
                      onDragStart={() => setDragId(o.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`group rounded-lg border border-border bg-surface-2 p-3 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04),0_1px_2px_rgb(0_0_0/0.25)] transition duration-150 hover:border-brand/40 hover:shadow-[0_8px_20px_-12px_rgb(0_0_0/0.7)] ${canWrite ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === o.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/deals/${o.id}`} className="truncate text-sm font-medium text-fg hover:underline">
                          {o.title}
                        </Link>
                        {o.ownerId && owners[o.ownerId] && <Avatar name={owners[o.ownerId]} size={20} />}
                      </div>
                      {(c?.name || c?.company) && <div className="truncate text-xs text-muted">{[c?.name, c?.company].filter(Boolean).join(" · ")}</div>}
                      <div className="mt-2 font-display text-sm font-semibold tabular-nums tracking-tight text-brand">{compactMoney(o.value, o.currency)}</div>
                      {/* Touch/keyboard-accessible move control — HTML5 drag doesn't
                          fire on touch devices, so this is the universal way to
                          move a deal between stages (drag still works on desktop).
                          stopPropagation keeps interacting with it from starting a drag. */}
                      {canWrite && (
                        <div className="mt-2.5 border-t border-border/60 pt-2" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                          <label className="sr-only" htmlFor={`move-${o.id}`}>Move {o.title} to stage</label>
                          <select
                            id={`move-${o.id}`}
                            value={o.stageId}
                            onChange={(e) => { if (e.target.value !== o.stageId) commitMove(o.id, e.target.value); }}
                            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted outline-none transition focus:border-brand"
                          >
                            {columns.map((s) => (
                              <option key={s.id} value={s.id}>{o.stageId === s.id ? `Stage: ${s.label}` : `Move to ${s.label}`}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
                {colItems.length === 0 && <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted">Drop here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
