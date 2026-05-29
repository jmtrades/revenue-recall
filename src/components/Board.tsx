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
      <div className={`grid gap-3 ${pending ? "opacity-70" : ""}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(230px, 1fr))` }}>
        {columns.map((stage) => {
          const colItems = items.filter((o) => o.stageId === stage.id);
          const total = colItems.reduce((s, o) => s + o.value, 0);
          const tone = stage.type === "won" ? "text-success" : stage.type === "lost" ? "text-danger" : "text-fg";
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
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className={`truncate text-sm font-medium ${tone}`}>{stage.label}</span>
                <span className="text-xs tabular-nums text-muted">{colItems.length}</span>
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
                      className={`group rounded-lg border border-border bg-surface-2 p-3 ${canWrite ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === o.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/deals/${o.id}`} className="truncate text-sm font-medium text-fg hover:underline">
                          {c?.name ?? o.title}
                        </Link>
                        {o.ownerId && owners[o.ownerId] && <Avatar name={owners[o.ownerId]} size={20} />}
                      </div>
                      {c?.company && <div className="truncate text-xs text-muted">{c.company}</div>}
                      <div className="mt-2 text-sm tabular-nums text-brand">{compactMoney(o.value, o.currency)}</div>
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
