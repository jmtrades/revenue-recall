"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Mobile marketing menu. The desktop nav links hide below `lg`, which used to
 * leave phone visitors with NO way to reach Features/Pricing/Industries — this
 * hamburger + animated sheet closes that gap. Items cascade in; static under
 * prefers-reduced-motion.
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
  const reduced = useReducedMotion();

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-fg transition-colors hover:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" aria-hidden="true">
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav
            key="mobile-menu"
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="absolute inset-x-0 top-16 z-50 border-b border-border bg-bg/95 px-5 pb-5 pt-2 backdrop-blur-xl"
          >
            <motion.ul
              initial={reduced ? false : "hidden"}
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              className="space-y-1"
            >
              {LINKS.map((l) => (
                <motion.li key={l.href} variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: EASE } } }}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-[15px] font-medium text-body transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </motion.ul>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-4">
              <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-border px-4 py-2.5 text-center text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
                Sign in
              </Link>
              <Link href="/signup" onClick={() => setOpen(false)} className="cta flex-1 rounded-full bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand/90">
                Start free
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
