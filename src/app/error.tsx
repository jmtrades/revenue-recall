"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this is where you'd report to your error tracker.
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <div className="text-5xl text-muted/50">⚠</div>
        <h1 className="mt-3 text-lg font-semibold text-white">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-muted">An unexpected error occurred. You can retry, or head back to your dashboard.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={reset} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">Try again</button>
          <a href="/dashboard" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-white hover:bg-surface-2">Dashboard</a>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-muted">Ref: {error.digest}</p>}
      </div>
    </div>
  );
}
