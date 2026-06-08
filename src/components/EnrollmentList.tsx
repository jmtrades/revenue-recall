"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type EnrollmentRow = {
  id: string;
  contactName: string;
  stepIndex: number;
  totalSteps: number;
  nextDueAt: string;
  dealId?: string;
};

function dueLabel(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "due now";
  if (days === 1) return "next step tomorrow";
  return `next step in ${days} days`;
}

/** Who's currently working through this cadence, with a one-click stop so a rep
 *  can pull someone out the moment they reply or shouldn't be contacted. */
export function EnrollmentList({ initial }: { initial: EnrollmentRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<EnrollmentRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function stop(r: EnrollmentRow) {
    if (!window.confirm(`Stop the cadence for ${r.contactName}? The remaining steps won't send.`)) return;
    setBusyId(r.id);
    setError(null);
    const prev = rows;
    setRows((cur) => cur.filter((x) => x.id !== r.id));
    try {
      const res = await fetch(`/api/sequences/enroll?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to stop");
      router.refresh();
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : "Failed to stop");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No one is in this cadence right now. Start it above to begin working a list.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              {r.dealId ? (
                <Link href={`/deals/${r.dealId}`} className="text-sm font-medium text-fg hover:underline">{r.contactName}</Link>
              ) : (
                <span className="text-sm font-medium text-fg">{r.contactName}</span>
              )}
              <span className="ml-2 text-xs text-muted">
                Step {Math.min(r.stepIndex + 1, r.totalSteps)} of {r.totalSteps} · {dueLabel(r.nextDueAt)}
              </span>
            </div>
            <button
              onClick={() => stop(r)}
              disabled={busyId === r.id}
              className="shrink-0 text-xs text-muted transition hover:text-danger disabled:opacity-50"
            >
              {busyId === r.id ? "Stopping…" : "Stop"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
