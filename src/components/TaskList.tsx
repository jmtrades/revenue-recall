"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskItem } from "@/lib/queries";

const CHANNEL: Record<string, string> = { call: "📞 Call", email: "✉ Email", sms: "💬 SMS" };
const PRIORITY: Record<string, string> = {
  high: "bg-danger/15 text-danger",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-2 text-muted",
};

function bucketLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "Later";
}

export function TaskList({ tasks }: { tasks: TaskItem[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const buckets = ["Today", "Tomorrow", "Later"];
  const grouped = buckets.map((b) => ({ label: b, items: tasks.filter((t) => bucketLabel(t.dueInDays) === b) }));
  const remaining = tasks.filter((t) => !done[t.id]).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{remaining} of {tasks.length} tasks remaining</p>
      {grouped.map(
        (g) =>
          g.items.length > 0 && (
            <div key={g.label}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.label} · {g.items.length}</h2>
              <ul className="space-y-2">
                {g.items.map((t) => (
                  <li
                    key={t.id}
                    className={`flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition ${done[t.id] ? "opacity-50" : ""}`}
                  >
                    <button
                      onClick={() => setDone((d) => ({ ...d, [t.id]: !d[t.id] }))}
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${done[t.id] ? "border-success bg-success text-white" : "border-border text-transparent hover:border-brand"}`}
                      aria-label="Toggle done"
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/deals/${t.dealId}`} className={`truncate text-sm font-medium text-white hover:underline ${done[t.id] ? "line-through" : ""}`}>
                          {t.title}
                        </Link>
                        <span className={`pill ${PRIORITY[t.priority]}`}>{t.priority}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{t.note}</p>
                      {t.contactName && <p className="mt-0.5 text-xs text-muted">{t.contactName}</p>}
                    </div>
                    <span className="pill shrink-0 bg-surface-2 text-muted">{CHANNEL[t.channel]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      {tasks.length === 0 && <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted">All caught up — no tasks right now.</p>}
    </div>
  );
}
