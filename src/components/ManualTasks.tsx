"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import type { ManualTask } from "@/lib/tasks/manual";

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A rep's own to-dos, on top of the auto-generated next-actions. */
export function ManualTasks({ initial }: { initial: ManualTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<ManualTask[]>(initial);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, dueAt: due || undefined }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't add task");
      setTasks((cur) => [b.task as ManualTask, ...cur]);
      setTitle("");
      setDue("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add task");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: ManualTask) {
    const done = !t.done;
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done } : x)));
    try {
      await fetch(`/api/tasks/manual/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      router.refresh();
    } catch {
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: t.done } : x))); // revert
    }
  }

  async function remove(t: ManualTask) {
    const prev = tasks;
    setTasks((cur) => cur.filter((x) => x.id !== t.id));
    try {
      await fetch(`/api/tasks/manual/${encodeURIComponent(t.id)}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setTasks(prev);
    }
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-fg">Your tasks</p>
      <p className="mt-0.5 text-xs text-muted">Add your own reminders — they live here alongside the auto‑generated next actions below.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a task…"
          className={`${input} min-w-[220px] flex-1`}
        />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Optional due date" className={input} />
        <button
          onClick={add}
          disabled={busy || !title.trim()}
          className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {tasks.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id} className={`flex items-center gap-3 py-2.5 ${t.done ? "opacity-50" : ""}`}>
              <button
                onClick={() => toggle(t)}
                aria-label="Toggle done"
                aria-pressed={t.done}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition ${t.done ? "border-success bg-success text-white" : "border-border text-transparent hover:border-brand"}`}
              >
                <Icon name="check" size={13} strokeWidth={3} />
              </button>
              <span className={`min-w-0 flex-1 truncate text-sm text-fg ${t.done ? "line-through" : ""}`}>{t.title}</span>
              {dueLabel(t.dueAt) && <span className="shrink-0 pill bg-surface-2 text-muted">{dueLabel(t.dueAt)}</span>}
              <button onClick={() => remove(t)} aria-label="Delete task" className="shrink-0 text-muted transition hover:text-danger">
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
