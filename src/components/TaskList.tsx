"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { TaskItem } from "@/lib/queries";
import { ChannelBadge, EmptyState, Button } from "@/components/ui";
import { Icon } from "@/components/icons";

const PRIORITY: Record<string, string> = {
  high: "bg-danger/15 text-danger",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-2 text-muted",
};

// Auto-generated tasks rebuild fresh from deal state on every load, so a checkbox
// kept only in component state silently reset on each refresh — erasing a rep's
// worked list. Persist completions per-browser, SCOPED TO THE LOCAL DAY: the task
// list is a daily working surface, so "done" survives refreshes through the day
// and resets the next day (avoiding a stale "done forever" once a deal re-surfaces).
const DONE_KEY = "rr.taskDone"; // { [taskId]: "YYYY-MM-DD" }
const localDay = () => new Date().toLocaleDateString("en-CA");

function bucketLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "Later";
}

export function TaskList({ tasks }: { tasks: TaskItem[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  // Hydrate today's completions on mount so checking a task off survives a refresh.
  useEffect(() => {
    try {
      const map = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, string>;
      const today = localDay();
      const todays: Record<string, boolean> = {};
      for (const [id, day] of Object.entries(map)) if (day === today) todays[id] = true;
      setDone(todays);
    } catch {
      /* storage unavailable — start empty */
    }
  }, []);

  function toggle(id: string) {
    setDone((d) => {
      const next = { ...d, [id]: !d[id] };
      try {
        const today = localDay();
        const map = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, string>;
        for (const k of Object.keys(map)) if (map[k] !== today) delete map[k]; // prune old days (bounded)
        if (next[id]) map[id] = today;
        else delete map[id];
        localStorage.setItem(DONE_KEY, JSON.stringify(map));
      } catch {
        /* storage full/blocked — still toggles in-memory this session */
      }
      return next;
    });
  }

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
                      onClick={() => toggle(t.id)}
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${done[t.id] ? "border-success bg-success text-white" : "border-border text-transparent hover:border-brand"}`}
                      aria-label="Toggle done"
                      aria-pressed={!!done[t.id]}
                    >
                      <Icon name="check" size={13} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/deals/${t.dealId}`} className={`truncate text-sm font-medium text-fg hover:underline ${done[t.id] ? "line-through" : ""}`}>
                          {t.title}
                        </Link>
                        <span className={`pill ${PRIORITY[t.priority]}`}>{t.priority}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{t.note}</p>
                      {t.contactName && <p className="mt-0.5 text-xs text-muted">{t.contactName}</p>}
                    </div>
                    <span className="shrink-0"><ChannelBadge channel={t.channel} /></span>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      {tasks.length === 0 && (
        <EmptyState
          iconName="tasks"
          title="No auto-generated tasks yet"
          hint="These are generated automatically from deals that need a follow-up — as you add deals and Autopilot works your pipeline, your prioritized next actions show up here. Need a one-off? Add it under “Your tasks” above."
          action={<Button href="/settings?tab=import">Import leads</Button>}
        />
      )}
    </div>
  );
}
