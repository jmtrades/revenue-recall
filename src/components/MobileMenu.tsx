"use client";

import { useState } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/nav";

export function MobileMenu({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-fg" aria-label="Menu">
        ☰
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="relative flex w-64 flex-col border-r border-border bg-surface px-3 py-5" onClick={(e) => e.stopPropagation()}>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="px-3 pb-6">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
                <span className="text-sm font-semibold text-fg">Revenue Recall</span>
              </div>
              <p className="mt-3 truncate text-xs text-muted">{orgName}</p>
            </Link>
            <NavLinks onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
