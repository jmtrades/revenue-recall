"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui";
import { money } from "@/lib/format";

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
}

export function LeadsTable({ rows, owners, valueLabel }: { rows: LeadRow[]; owners: string[]; valueLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (owner && r.owner !== owner) return false;
      if (!term) return true;
      return r.name.toLowerCase().includes(term) || r.company.toLowerCase().includes(term) || r.email.toLowerCase().includes(term);
    });
  }, [rows, q, owner]);

  return (
    <div>
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
        <span className="ml-auto text-sm text-muted">{filtered.length} of {rows.length}</span>
      </div>

      <div className="card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Stage</th>
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
                <td className="px-4 py-3 text-muted">{r.owner}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{r.value !== null ? money(r.value, r.currency) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No matching leads.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
