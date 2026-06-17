"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSampleDataAction } from "@/app/(app)/dashboard/actions";

/**
 * Shown only when the workspace still holds demo records. Lets the owner wipe
 * all sample data in one click so what they see is 100% their own real, live
 * data — the inverse of "Explore with sample data".
 */
export function RemoveSampleDataBanner() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeSampleDataAction();
      if (!res.ok) {
        setError(res.error ?? "Couldn't remove sample data — try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
      <p className="text-sm text-fg">
        <span className="font-medium">This workspace has sample data.</span>{" "}
        <span className="text-muted">It’s for demos only — remove it to see just your real, live leads.</span>
      </p>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={remove}
          disabled={pending}
          className="shrink-0 rounded-lg border border-warn/50 bg-surface px-3 py-1.5 text-sm font-medium text-fg transition hover:border-warn disabled:opacity-60"
        >
          {pending ? "Removing…" : "Remove sample data"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
