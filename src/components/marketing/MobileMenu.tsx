"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LogoBadge } from "@/components/Logo";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Mobile marketing menu. The desktop nav links hide below `lg`, which used to
 * leave phone visitors with NO way to reach Features/Pricing/Industries — this
 * hamburger + sheet closes that gap.
 *
 * The overlay is rendered through a portal to <body> on purpose: MarketingNav is
 * a sticky header with backdrop-blur, and a backdrop-filter ancestor becomes the
 * containing block for fixed/absolute descendants — which trapped the old
 * dropdown inside the header and let the hero show straight through the menu
 * (the "see-through menu" bug). Portaling to the body root escapes that, and a
 * solid scrim + opaque sheet guarantee nothing bleeds through behind the links.
 */
const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#industries", label: "Industries" },
  { href: "/#who", label: "Who it's for" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/#pricing", label: "Pricing" },
];

const EASE = [0.23, 1, 0.32, 1] as const;

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();
  useEscapeKey(open, () => setOpen(false));
  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  // Portals need the document — only render the overlay after mount.
  useEffect(() => setMounted(true), []);

  // Lock background scroll while the menu is open so the page behind doesn't
  // slide under your finger on a phone.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-fg transition-colors hover:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="marketing-mobile-menu"
                className="fixed inset-0 z-[100]"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Solid scrim — taps close the menu and nothing behind shows through. */}
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                />

                {/* Opaque sheet dropping from the top. */}
                <motion.div
                  ref={sheetRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu"
                  initial={reduced ? false : { y: "-100%" }}
                  animate={{ y: 0 }}
                  exit={reduced ? undefined : { y: "-100%" }}
                  transition={{ duration: 0.32, ease: EASE }}
                  className="absolute inset-x-0 top-0 max-h-[92dvh] overflow-y-auto rounded-b-2xl border-b border-border bg-surface px-5 pb-6 pt-3 shadow-2xl outline-none"
                >
                  <div className="flex h-12 items-center justify-between">
                    <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
                      <LogoBadge box={30} />
                      <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-fg transition-colors hover:bg-surface-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {LINKS.map((l) => (
                      <li key={l.href}>
                        <a
                          href={l.href}
                          onClick={() => setOpen(false)}
                          className="block rounded-lg px-3 py-3 text-[15px] font-medium text-body transition-colors hover:bg-surface-2 hover:text-fg"
                        >
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                    <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-border px-4 py-3 text-center text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
                      Sign in
                    </Link>
                    <Link href="/signup" onClick={() => setOpen(false)} className="cta flex-1 rounded-full bg-brand-strong px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-strong/90">
                      Start free
                    </Link>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
