"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useResource } from "@/lib/useResource";

interface Note { id: string; kind: "reply" | "recall" | "new_lead" | "stage_change"; title: string; detail: string; href: string }

const KIND_LABEL: Record<Note["kind"], string> = {
  reply: "Replied",
  recall: "At risk",
  new_lead: "New deal",
  stage_change: "Moved",
};

export function Notifications() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));

  const { data, loading } = useResource<Note[]>(
    "/api/notifications",
    (json) => (Array.isArray((json as { items?: unknown })?.items) ? (json as { items: Note[] }).items : []),
    { cache: "default" },
  );
  const items = data ?? [];
  const loaded = !loading;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:bg-surface-2 hover:text-fg"
        aria-label="Notifications"
      >
        <Icon name="bell" size={17} />
        {loaded && items.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-fg">Needs attention</div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">{loaded ? "All clear" : "Loading…"}</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { setOpen(false); router.push(n.href); }}
                    className="block w-full border-b border-border/60 px-4 py-3 text-left transition last:border-0 hover:bg-surface-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-fg">{n.title}</span>
                      <span className="shrink-0 text-xs text-muted">{KIND_LABEL[n.kind]}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.detail}</p>
                  </button>
                ))
              )}
            </div>
            <button onClick={() => { setOpen(false); router.push("/recall"); }} className="w-full bg-surface-2 px-4 py-2.5 text-center text-sm text-brand hover:bg-surface-2/70">
              View all in Revenue Recall →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
