"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReasonBadge, ChannelBadge, ScoreDot } from "@/components/ui";
import { money, relativeDays } from "@/lib/format";

export interface RecallRow {
  opportunityId: string;
  title: string;
  contactLabel: string;
  reason: string;
  score: number;
  value: number;
  weightedValue: number;
  currency: string;
  daysSinceActivity: number;
  channel: string;
  recommendation: string;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "going_cold", label: "Going cold" },
  { id: "stalled", label: "Stalled" },
  { id: "lost_winnable", label: "Winnable losses" },
  { id: "no_activity", label: "Untouched" },
];

export function RecallQueue({ rows }: { rows: RecallRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? rows : rows.filter((r) => r.reason === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? rows.length : rows.filter((r) => r.reason === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${filter === f.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-white"}`}
            >
              {f.label} <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card p-0">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">Nothing here right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Why</th>
                <th className="px-4 py-3 font-medium">Recoverable</th>
                <th className="px-4 py-3 font-medium">Last touch</th>
                <th className="px-4 py-3 font-medium">Next best action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.opportunityId}
                  onClick={() => router.push(`/deals/${r.opportunityId}`)}
                  className="cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-surface-2/40"
                >
                  <td className="px-4 py-4"><ScoreDot score={r.score} /></td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{r.title}</div>
                    <div className="text-xs text-muted">{r.contactLabel}</div>
                  </td>
                  <td className="px-4 py-4"><ReasonBadge reason={r.reason} /></td>
                  <td className="px-4 py-4 tabular-nums text-white">
                    {money(r.weightedValue, r.currency)}
                    <div className="text-xs text-muted">of {money(r.value, r.currency)}</div>
                  </td>
                  <td className="px-4 py-4 text-muted">{relativeDays(r.daysSinceActivity)}</td>
                  <td className="px-4 py-4">
                    <div className="mb-2"><ChannelBadge channel={r.channel} /></div>
                    <p className="max-w-md text-xs leading-relaxed text-muted">{r.recommendation}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
