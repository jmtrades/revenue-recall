"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrgSettingsForm({
  initialName,
  initialQuota,
  persisted,
}: {
  initialName: string;
  initialQuota: number;
  persisted: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [quota, setQuota] = useState(String(initialQuota));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== initialName || Number(quota) !== initialQuota;
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-60";

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, monthlyQuota: Number(quota) || 0 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="stat-label">Organization name</label>
        <input className={`${input} mt-1`} value={name} disabled={!persisted} onChange={(e) => { setName(e.target.value); setStatus("idle"); }} />
      </div>
      <div>
        <label className="stat-label">Monthly revenue goal</label>
        <input className={`${input} mt-1`} type="number" min={0} value={quota} disabled={!persisted} onChange={(e) => { setQuota(e.target.value); setStatus("idle"); }} />
      </div>

      {persisted ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || status === "saving"} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
            {status === "saving" ? "Saving…" : "Save changes"}
          </button>
          {status === "saved" && <span className="text-sm text-success">Saved ✓</span>}
          {status === "error" && <span className="text-sm text-danger">{error}</span>}
        </div>
      ) : (
        <p className="text-xs text-muted">Connect a database to edit these. Without one, values come from environment variables.</p>
      )}
    </div>
  );
}
