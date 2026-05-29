"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import type { AgentRun, AgentTask } from "@/lib/agent/types";

const RESULT_STYLE: Record<string, string> = {
  sent: "bg-success/15 text-success",
  logged: "bg-success/15 text-success",
  drafted: "bg-brand-soft text-brand",
  queued: "bg-warn/15 text-warn",
  skipped: "bg-surface-2 text-muted",
};

export function AgentsView({
  initialTasks,
  initialRuns,
  stages,
}: {
  initialTasks: AgentTask[];
  initialRuns: AgentRun[];
  stages: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [runs, setRuns] = useState(initialRuns);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [channel, setChannel] = useState("email");
  const [autonomy, setAutonomy] = useState("review");
  const [scope, setScope] = useState("recall_queue");
  const [trigger, setTrigger] = useState("manual");
  const [creating, setCreating] = useState(false);

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  async function create() {
    if (!name.trim() || !goal.trim()) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal, channel, autonomy, scope, trigger }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed");
      setTasks((t) => [b.task, ...t]);
      setName(""); setGoal("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function run(id: string) {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/agent/tasks/${id}/run`, { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Run failed");
      setRuns((r) => [b.run, ...r]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/agent/tasks/${id}`, { method: "DELETE" });
    setTasks((t) => t.filter((x) => x.id !== id));
    router.refresh();
  }

  const taskName = (id: string) => tasks.find((t) => t.id === id)?.name ?? "Task";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <section className="card border-brand/30">
          <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={16} className="text-brand" /> New autopilot task</h2>
          <p className="mt-1 text-xs text-muted">Describe what you want done in plain English. The AI works each deal for you.</p>
          <div className="mt-3 space-y-2.5">
            <input className={input} placeholder="Task name (e.g. Re-engage cold deals)" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className={`${input} resize-none`} rows={3} placeholder="Instruction — e.g. 'Reach out to deals that have gone quiet, reference our last conversation, and offer a 15-minute call this week.'" value={goal} onChange={(e) => setGoal(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="recall_queue">Recall queue</option>
                <option value="all_open">All open deals</option>
                {stages.map((s) => <option key={s.id} value={`stage:${s.id}`}>Stage: {s.label}</option>)}
              </select>
              <select className={input} value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="call">Call (talk track)</option>
                <option value="none">Recommendation only</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={autonomy} onChange={(e) => setAutonomy(e.target.value)}>
                <option value="review">Review — I approve</option>
                <option value="auto">Autonomous — send</option>
              </select>
              <select className={input} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="manual">Run manually</option>
                <option value="daily">Daily (auto)</option>
                <option value="on_idle_deal">When a deal goes idle</option>
                <option value="on_new_lead">When a lead is created</option>
              </select>
            </div>
            <button onClick={create} disabled={creating || !name.trim() || !goal.trim()} className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {creating ? "Creating…" : "Create task"}
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold text-fg">Your tasks</h2>
          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No tasks yet. Create one above.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{t.name}</span>
                    <span className="pill bg-surface text-muted">{t.autonomy === "auto" ? "Autonomous" : "Review"}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{t.goal}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => run(t.id)} disabled={busy === t.id} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                      {busy === t.id ? "Running…" : "▶ Run now"}
                    </button>
                    <button onClick={() => remove(t.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-danger">Delete</button>
                    <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{t.channel}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      </div>

      <section className="card p-0">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-fg">Run ledger</div>
        {runs.length === 0 ? (
          <p className="p-6 text-sm text-muted">No runs yet — create a task and hit “Run now”. Every action the AI takes is recorded here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">{taskName(r.taskId)}</span>
                  <span className="flex items-center gap-2">
                    {r.ai ? <span className="pill bg-brand-soft text-brand">AI</span> : <span className="pill bg-surface-2 text-muted">templates</span>}
                    <span className={`pill ${r.status === "failed" ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>{r.status}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{r.summary}</p>
                {r.actions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.actions.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1.5 text-xs">
                        <span className={`pill ${RESULT_STYLE[a.result] ?? "bg-surface-2 text-muted"}`}>{a.result}</span>
                        {a.dealId ? <Link href={`/deals/${a.dealId}`} className="font-medium text-fg hover:underline">{a.title}</Link> : <span className="font-medium text-fg">{a.title}</span>}
                        <span className="truncate text-muted">{a.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
