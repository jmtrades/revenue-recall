"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Conversion: a slim sticky bar that slides up once the visitor scrolls past
 * the hero, keeping the primary CTA one tap away through the whole page — a
 * proven lift on long landing pages. Dismissible, and it hides itself near the
 * footer so it never covers the final CTA. Respects the page's dark premium
 * styling; no layout shift (fixed, off the flow).
 */
export function StickyCTA() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    function onScroll() {
      const y = window.scrollY;
      const nearBottom = window.innerHeight + y > document.body.scrollHeight - 900;
      setShow(y > 720 && !nearBottom);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-[transform,opacity] duration-300 ease-out ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
      aria-hidden={!show}
    >
      <div className="mx-auto mb-3 flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-surface/80 px-4 py-3 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:px-5">
        <span className="hidden h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand sm:block" />
        <p className="min-w-0 flex-1 truncate text-sm text-fg">
          <span className="font-semibold">Start recovering revenue today.</span>{" "}
          <span className="hidden text-muted sm:inline">No card. Live in 2 minutes.</span>
        </p>
        <Link
          href="/signup"
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
        >
          Start free
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-muted transition hover:text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
