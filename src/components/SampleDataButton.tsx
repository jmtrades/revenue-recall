"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadSampleDataAction } from "@/app/(app)/dashboard/actions";

/**
 * One-click demo pipeline on the first-run dashboard. Pending state matters:
 * the load writes a few dozen records, so the button narrates ("Building your
 * pipeline…") instead of appearing hung, then the refreshed dashboard renders
 * with everything lit up.
 */
export function SampleDataButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await loadSampleDataAction();
      if (!res.ok) {
        setError(res.error ?? "Couldn't load sample data — try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={load}
        disabled={pending}
        className="cta inline-flex items-center gap-2 rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90 disabled:opacity-70"
      >
        {pending ? (
          <>
            <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
            Building your pipeline…
          </>
        ) : (
          "Explore with sample data"
        )}
      </button>
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">{error}</p>}
    </div>
  );
}
