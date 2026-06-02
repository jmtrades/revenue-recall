"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, EmptyState, Button } from "@/components/ui";
import { money } from "@/lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_TONE, type LeadStatus } from "@/lib/crm/lead-status";
import { SEGMENTS, getSegment, highValueThreshold } from "@/lib/crm/segments";

export interface LeadRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  owner: string;
  value: number | null;
  currency: string;
  stage: string;
  status?: LeadStatus;
}

export function LeadsTable({ rows, owners, valueLabel }: { rows: LeadRow[]; owners: string[]; valueLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");
  const [segment, setSegment] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);

  // "High value" = the top quartile of THIS pipeline's deal values, so the
  // segment means something for any business (not a hard-coded number).
  const hvt = useMemo(() => highValueThreshold(rows.map((r) => r.value)), [rows]);
  const counts = useMemo(() => {
    const ctx = { highValueThreshold: hvt };
    return Object.fromEntries(SEGMENTS.map((s) => [s.id, rows.filter((r) => s.match(r, ctx)).length]));
  }, [rows, hvt]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const seg = getSegment(segment);
    return rows.filter((r) => {
      if (!seg.match(r, { highValueThreshold: hvt })) return false;
      if (owner && r.owner !== owner) return false;
      if (status && r.status !== status) return false;
      if (!term) return true;
      return r.name.toLowerCase().includes(term) || r.company.toLowerCase().includes(term) || r.email.toLowerCase().includes(term);
    });
  }, [rows, q, owner, status, segment, hvt]);

  async function changeStatus(id: string, next: LeadStatus) {
    setSaving(id);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(null);
    }
  }

  // True empty workspace (no records at all) — guide the user to add data
  // rather than showing an empty filter UI and a confusing "no match" row.
  if (rows.length === 0) {
    return (
      <EmptyState
        iconName="leads"
        title="No leads yet"
        hint="Import a CSV, connect your CRM or database, or add one by hand. The moment leads land here, Revenue Recall starts surfacing what's slipping."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button href="/settings?tab=import" variant="primary" size="sm">Import a CSV</Button>
            <Button href="/settings?tab=integrations" variant="outline" size="sm">Connect a source</Button>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSegment(s.id)}
            aria-pressed={segment === s.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${segment === s.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-fg"}`}
          >
            {s.label} <span className={segment === s.id ? "text-white/70" : "text-muted/60"}>{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, email…"
          className="w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand">
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted">{filtered.length} of {rows.length}</span>
      </div>

      <div className="card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/leads/${r.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <Avatar name={r.name} size={28} />
                    <span>
                      <span className="block font-medium text-fg">{r.name}</span>
                      <span className="block text-xs text-muted">{r.email}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{r.company || "—"}</td>
                <td className="px-4 py-3"><span className="pill bg-surface-2 text-muted">{r.stage}</span></td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={r.status ?? ""}
                    disabled={saving === r.id}
                    onChange={(e) => changeStatus(r.id, e.target.value as LeadStatus)}
                    className={`rounded-md border border-border px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-50 ${r.status ? LEAD_STATUS_TONE[r.status] : "bg-surface text-muted"}`}
                    aria-label={`Lead status for ${r.name}`}
                  >
                    <option value="" disabled>Set status…</option>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-muted">{r.owner}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{r.value !== null ? money(r.value, r.currency) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No leads match your search or filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
