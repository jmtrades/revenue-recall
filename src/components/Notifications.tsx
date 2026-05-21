"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Note { id: string; title: string; reason: string; score: number; recommendation: string }

const REASON_LABEL: Record<string, string> = {
  going_cold: "Going cold",
  stalled: "Stalled",
  lost_winnable: "Winnable loss",
  no_activity: "Untouched",
};

export function Notifications() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => { setItems(d.items); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:bg-surface-2 hover:text-white"
        aria-label="Notifications"
      >
        ◔
        {loaded && items.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-white">Needs attention</div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">{loaded ? "All clear 🎉" : "Loading…"}</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { setOpen(false); router.push(`/deals/${n.id}`); }}
                    className="block w-full border-b border-border/60 px-4 py-3 text-left transition last:border-0 hover:bg-surface-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-white">{n.title}</span>
                      <span className="shrink-0 text-xs text-muted">{REASON_LABEL[n.reason] ?? n.reason}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.recommendation}</p>
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
