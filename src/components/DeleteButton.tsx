"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

/**
 * Reusable destructive action: confirm, DELETE the endpoint, then redirect away
 * from the now-gone record. Used to remove junk/duplicate deals and contacts.
 * Styled as a subtle danger button so it never competes with primary actions.
 */
export function DeleteButton({
  endpoint,
  label,
  confirmText,
  redirectTo,
}: {
  endpoint: string;
  label: string;
  confirmText: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      toast("Deleted");
      // Leave the button disabled through the navigation to block a double-submit.
      startTransition(() => {
        router.push(redirectTo);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={onDelete}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
      >
        {busy ? "Deleting…" : label}
      </button>
      {error && <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
