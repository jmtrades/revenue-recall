"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";
import { compactMoney } from "@/lib/format";

interface Props {
  pipeline: Pipeline;
  opportunities: Opportunity[];
  contacts: Record<string, Pick<Contact, "name" | "company">>;
  canWrite: boolean;
}

export function Board({ pipeline, opportunities, contacts, canWrite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openStages = pipeline.stages.filter((s) => s.type === "open");
  const terminalStages = pipeline.stages.filter((s) => s.type !== "open");
  const columns = [...openStages, ...terminalStages];

  async function move(id: string, stageId: string) {
    setMoving(id);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Move failed");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    } finally {
      setMoving(null);
    }
  }

  const byStage = (stageId: string) => opportunities.filter((o) => o.stageId === stageId);

  return (
    <div>
      {error && <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className={`grid gap-4 ${pending ? "opacity-60" : ""}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
        {columns.map((stage) => {
          const items = byStage(stage.id);
          const total = items.reduce((sum, o) => sum + o.value, 0);
          return (
            <div key={stage.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="truncate text-sm font-medium text-white">{stage.label}</span>
                <span className="text-xs tabular-nums text-muted">{items.length}</span>
              </div>
              <div className="px-3 py-1 text-xs tabular-nums text-muted">{compactMoney(total, items[0]?.currency ?? "USD")}</div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((o) => {
                  const c = contacts[o.contactId];
                  return (
                    <div key={o.id} className="rounded-lg border border-border bg-surface-2 p-3">
                      <div className="truncate text-sm font-medium text-white">{c?.name ?? o.title}</div>
                      {c?.company && <div className="truncate text-xs text-muted">{c.company}</div>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm tabular-nums text-brand">{compactMoney(o.value, o.currency)}</span>
                        {canWrite && (
                          <select
                            aria-label="Move stage"
                            disabled={moving === o.id}
                            value={o.stageId}
                            onChange={(e) => move(o.id, e.target.value)}
                            className="max-w-[110px] rounded border border-border bg-surface px-1.5 py-1 text-xs text-muted outline-none focus:border-brand"
                          >
                            {pipeline.stages.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
