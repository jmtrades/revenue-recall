"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BookingStatus } from "@/lib/meetings/types";

export interface BookingRow {
  id: string;
  meetingName: string;
  inviteeName: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  dealId: string | null;
  whenLabel: string;
  status: BookingStatus;
  past: boolean;
}

const STATUS_PILL: Record<BookingStatus, string> = {
  confirmed: "bg-brand-soft text-brand",
  completed: "bg-success/15 text-success",
  no_show: "bg-warn/15 text-warn",
  cancelled: "bg-surface-2 text-muted",
};
const STATUS_LABEL: Record<BookingStatus, string> = { confirmed: "Confirmed", completed: "Completed", no_show: "No-show", cancelled: "Cancelled" };

export function BookingsManager({ upcoming, past }: { upcoming: BookingRow[]; past: BookingRow[] }) {
  return (
    <div className="space-y-8">
      <Section title="Upcoming" rows={upcoming} empty="No upcoming meetings. Share your booking link from Settings → Scheduling." />
      <Section title="Past" rows={past} empty="No past meetings yet." />
    </div>
  );
}

function Section({ title, rows, empty }: { title: string; rows: BookingRow[]; empty: string }) {
  return (
    <div>
      <h2 className="mb-3 font-editorial text-xl font-semibold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-4 text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ b }: { b: BookingRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BookingStatus>(b.status);

  async function mark(next: BookingStatus) {
    setBusy(true);
    setError(null);
    const prev = status;
    setStatus(next); // optimistic
    try {
      const res = await fetch("/api/meetings/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, status: next }) });
      if (!res.ok) {
        setStatus(prev);
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setStatus(prev);
      setError("Couldn't save — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const contact = [b.inviteeEmail, b.inviteePhone].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{b.inviteeName}</span>
          <span className={`pill ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
          {b.dealId && (
            <Link href={`/deals/${b.dealId}`} className="text-xs text-brand hover:underline">
              View deal
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {b.meetingName} · {b.whenLabel}
          {contact ? ` · ${contact}` : ""}
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Past, still confirmed → record the outcome. */}
        {b.past && status === "confirmed" && (
          <>
            <button onClick={() => mark("completed")} disabled={busy} className="rounded-lg border border-success/40 px-2.5 py-1 text-xs text-success transition hover:bg-success/10 disabled:opacity-50">
              Completed
            </button>
            <button onClick={() => mark("no_show")} disabled={busy} className="rounded-lg border border-warn/40 px-2.5 py-1 text-xs text-warn transition hover:bg-warn/10 disabled:opacity-50">
              No-show
            </button>
          </>
        )}
        {/* Upcoming, confirmed → a rep can cancel it (frees the slot). */}
        {!b.past && status === "confirmed" && (
          <button onClick={() => { if (window.confirm("Cancel this meeting? The slot will reopen.")) void mark("cancelled"); }} disabled={busy} className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50">
            Cancel
          </button>
        )}
        {/* Recorded outcome → allow an undo back to confirmed. */}
        {status !== "confirmed" && (
          <button onClick={() => mark("confirmed")} disabled={busy} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
