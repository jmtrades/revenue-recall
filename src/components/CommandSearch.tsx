"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Results {
  contacts: { id: string; name: string; company: string }[];
  deals: { id: string; title: string; value: number; currency: string }[];
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>({ contacts: [], deals: [] });
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setResults({ contacts: [], deals: [] });
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ contacts: [], deals: [] });
      return;
    }
    const id = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 150);
    return () => clearTimeout(id);
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-72 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition hover:border-brand/50"
      >
        <span>⌕</span>
        <span className="flex-1 text-left">Search contacts, deals…</span>
        <kbd className="rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-28" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contacts and deals…"
              className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm text-white outline-none placeholder:text-muted"
            />
            <div className="max-h-80 overflow-y-auto p-2">
              {results.contacts.length === 0 && results.deals.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">{q ? "No matches" : "Type to search"}</p>
              )}
              {results.contacts.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">Contacts</p>
                  {results.contacts.map((c) => (
                    <button key={c.id} onClick={() => go(`/leads/${c.id}`)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-surface-2">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted">{c.company}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.deals.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">Deals</p>
                  {results.deals.map((d) => (
                    <button key={d.id} onClick={() => go(`/deals/${d.id}`)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-surface-2">
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-xs text-muted">{new Intl.NumberFormat("en-US", { style: "currency", currency: d.currency, notation: "compact" }).format(d.value)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
