"use client";

import { useEffect, useState } from "react";
import type { ToastDetail, ToastTone } from "@/lib/toast";

interface Item {
  id: number;
  message: string;
  tone: ToastTone;
}

let nextId = 1;

const TONE: Record<ToastTone, string> = {
  success: "border-success/40 bg-success/10 text-success",
  error: "border-danger/40 bg-danger/10 text-danger",
  info: "border-border bg-surface text-fg",
};

/**
 * Global toast host: listens for rr:toast events and renders a stack of brief,
 * auto-dismissing confirmations. Mounted once in the app shell so a toast fired
 * just before a navigation still shows on the next page (the host persists
 * across client-side route changes). Announced politely for screen readers.
 */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d?.message) return;
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { id, message: d.message, tone: d.tone ?? "info" }]);
      window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
    };
    window.addEventListener("rr:toast", onToast);
    return () => window.removeEventListener("rr:toast", onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${TONE[t.tone]}`}
        >
          <span className="min-w-0">{t.message}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 opacity-60 transition hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
