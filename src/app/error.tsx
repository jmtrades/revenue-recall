"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError({ message: error.message, stack: error.stack, digest: error.digest, source: "boundary" });
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-inset ring-danger/20">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </span>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-fg">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">An unexpected error occurred. You can retry, or head back to your dashboard.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="cta inline-flex items-center gap-1.5 rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
            Try again
          </button>
          <a href="/dashboard" className="cta inline-flex items-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">Dashboard</a>
        </div>
        {error.digest && <p className="mt-5 font-mono text-[11px] text-muted/70">Ref: {error.digest}</p>}
      </div>
    </div>
  );
}
