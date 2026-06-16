"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { NAV_GROUPS } from "@/components/nav";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Results {
  contacts: { id: string; name: string; company: string }[];
  deals: { id: string; title: string; value: number; currency: string }[];
}

interface Command {
  label: string;
  href: string;
  icon: IconName;
}

// Every page from the sidebar becomes a jump command, plus the deep-link
// actions people actually hunt for. One palette = whole product, zero mousing.
const COMMANDS: Command[] = [
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ label: `Go to ${i.label}`, href: i.href, icon: i.icon }))),
  { label: "Go to Settings", href: "/settings", icon: "settings" },
  { label: "Import leads (CSV)", href: "/settings?tab=import", icon: "upload" },
  { label: "Connect your CRM", href: "/settings?tab=integrations", icon: "database" },
  { label: "Set up your voice", href: "/settings?tab=voice", icon: "templates" },
  { label: "Invite your team", href: "/settings?tab=team", icon: "leads" },
  { label: "Billing & plan", href: "/settings?tab=billing", icon: "reports" },
];

// What an empty palette offers — the highest-value jumps, recall first.
const DEFAULT_COMMANDS = [
  "Go to Revenue Recall",
  "Go to Pipeline",
  "Go to Power Dialer",
  "Import leads (CSV)",
  "Invite your team",
  "Billing & plan",
]
  .map((l) => COMMANDS.find((c) => c.label === l))
  .filter((c): c is Command => Boolean(c));

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>({ contacts: [], deals: [] });
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

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
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ contacts: [], deals: [] });
      setFailed(false);
      return;
    }
    // `ignore` drops a stale response: a slow earlier request must not overwrite
    // the results for a newer query. The try/catch also stops a network error
    // from surfacing as an unhandled promise rejection — it shows a notice.
    let ignore = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Results;
        if (!ignore) {
          setResults({ contacts: data.contacts ?? [], deals: data.deals ?? [] });
          setFailed(false);
        }
      } catch {
        if (!ignore) {
          setResults({ contacts: [], deals: [] });
          setFailed(true);
        }
      }
    }, 150);
    return () => {
      ignore = true;
      clearTimeout(id);
    };
  }, [q]);

  const commands = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return DEFAULT_COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 6);
  }, [q]);

  // One flat, ordered list for keyboard navigation: commands, then contacts,
  // then deals — exactly the order they render in.
  const flat = useMemo(
    () => [
      ...commands.map((c) => ({ key: `cmd-${c.href}-${c.label}`, href: c.href })),
      ...results.contacts.map((c) => ({ key: `contact-${c.id}`, href: `/leads/${c.id}` })),
      ...results.deals.map((d) => ({ key: `deal-${d.id}`, href: `/deals/${d.id}` })),
    ],
    [commands, results],
  );

  // New query or fresh results → selection snaps back to the top.
  useEffect(() => setActive(0), [q, results]);

  // Keep the active row visible as the selection moves.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) go(item.href);
    }
  }

  // Rendered row index — increments across the three sections so data-idx
  // lines up with the flat list above.
  let idx = -1;
  const rowCls = (i: number) =>
    `flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-fg ${i === active ? "bg-surface-2" : "hover:bg-surface-2/60"}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-sm text-muted transition hover:border-brand/50 sm:h-auto sm:w-full sm:max-w-72 sm:justify-start sm:px-3 sm:py-2"
      >
        <Icon name="search" size={16} className="shrink-0" />
        <span className="hidden flex-1 truncate text-left sm:inline">Search…</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-16 sm:pt-28" onClick={() => setOpen(false)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command menu" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl outline-none" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search, or jump anywhere…"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-list"
              aria-activedescendant={flat[active] ? `cmdk-${active}` : undefined}
              aria-autocomplete="list"
              className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm text-fg outline-none placeholder:text-muted"
            />
            <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
              {commands.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">{q.trim() ? "Commands" : "Quick actions"}</p>
                  {commands.map((c) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button key={`cmd-${c.href}-${c.label}`} id={`cmdk-${i}`} data-idx={i} role="option" aria-selected={i === active} onClick={() => go(c.href)} onMouseEnter={() => setActive(i)} className={rowCls(i)}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-brand-soft/60 text-brand"><Icon name={c.icon} size={13} /></span>
                          <span className="truncate">{c.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {commands.length === 0 && results.contacts.length === 0 && results.deals.length === 0 && (
                <p className={`px-3 py-6 text-center text-sm ${failed ? "text-danger" : "text-muted"}`}>
                  {failed ? "Search is unavailable right now — try again." : q ? "No matches" : "Type to search"}
                </p>
              )}
              {results.contacts.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">Contacts</p>
                  {results.contacts.map((c) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button key={`contact-${c.id}`} id={`cmdk-${i}`} data-idx={i} role="option" aria-selected={i === active} onClick={() => go(`/leads/${c.id}`)} onMouseEnter={() => setActive(i)} className={rowCls(i)}>
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted">{c.company}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {results.deals.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">Deals</p>
                  {results.deals.map((d) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button key={`deal-${d.id}`} id={`cmdk-${i}`} data-idx={i} role="option" aria-selected={i === active} onClick={() => go(`/deals/${d.id}`)} onMouseEnter={() => setActive(i)} className={rowCls(i)}>
                        <span className="truncate">{d.title}</span>
                        <span className="shrink-0 text-xs text-muted">{new Intl.NumberFormat("en-US", { style: "currency", currency: d.currency, notation: "compact" }).format(d.value)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted">
              <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↑</kbd><kbd className="rounded border border-border px-1">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↵</kbd> open</span>
              <span className="ml-auto flex items-center gap-1"><kbd className="rounded border border-border px-1">esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
