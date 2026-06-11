"use client";
import { LogoBadge } from "@/components/Logo";

import { useState } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/nav";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";

export function MobileMenu({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));
  const drawerRef = useFocusTrap<HTMLElement>(open);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} aria-haspopup="menu" aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-fg" aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={`${orgName} menu`} className="relative flex w-64 flex-col border-r border-border bg-surface px-3 py-5 outline-none" onClick={(e) => e.stopPropagation()}>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="px-3 pb-6">
              <div className="flex items-center gap-2.5">
                <LogoBadge box={32} />
                <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
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
