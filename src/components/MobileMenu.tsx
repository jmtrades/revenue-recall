"use client";
import { LogoBadge } from "@/components/Logo";

import { useState } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/nav";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";

export function MobileMenu({ orgName, showAdmin = false }: { orgName: string; showAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));
  const drawerRef = useFocusTrap<HTMLElement>(open);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} aria-haspopup="menu" aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-fg" aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60]">
          {/* Solid scrim — a plain opaque-ish layer, NOT backdrop-blur: on iOS
              Safari a backdrop-filter sibling breaks the drawer's own paint, which
              made the page bleed through the menu. A button so a tap outside closes. */}
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/70" />
          {/* Drawer — absolutely positioned and explicitly opaque, so it always
              fully covers the page content behind it (with a shadow to separate). */}
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${orgName} menu`}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto border-r border-border bg-surface px-3 py-5 shadow-2xl outline-none"
          >
            <Link href="/dashboard" onClick={() => setOpen(false)} className="px-3 pb-6">
              <div className="flex items-center gap-2.5">
                <LogoBadge box={32} />
                <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
              </div>
              <p className="mt-3 truncate text-xs text-muted">{orgName}</p>
            </Link>
            <NavLinks onNavigate={() => setOpen(false)} showAdmin={showAdmin} />
          </aside>
        </div>
      )}
    </div>
  );
}
