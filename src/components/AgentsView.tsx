"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { compactMoney } from "@/lib/format";
import type { AgentRun, AgentTask } from "@/lib/agent/types";

const RESULT_STYLE: Record<string, string> = {
  sent: "bg-success/15 text-success",
  logged: "bg-success/15 text-success",
  drafted: "bg-brand-soft text-brand",
  queued: "bg-warn/15 text-warn",
  skipped: "bg-surface-2 text-muted",
};

const CHANNEL_ICON: Record<string, IconName> = { email: "mail", sms: "message", call: "dialer", none: "recall" };

interface Summary {
  activeTasks: number;
  activeAuto: number;
  actionsTaken: number;
  dealsWorked: number;
  recoverableTouched: number;
  currency: string;
}

// Plain-English starting points so the page is never an empty form.
const TEMPLATES: { label: string; name: string; goal: string; channel: string; scope: string }[] = [
  {
    label: "Re-engage cold deals",
    name: "Re-engage cold deals",
    goal: "Reach out to deals that have gone quiet. Reference our last conversation, add a genuine reason to talk now, and offer a specific 15-minute window this week.",
    channel: "email",
    scope: "recall_queue",
  },
  {
    label: "Win back lost deals",
    name: "Win-back lost deals",
    goal: "Work deals marked lost-but-winnable. Acknowledge the timing wasn't right, share what's changed, and propose a low-pressure next step.",
    channel: "email",
    scope: "recall_queue",
  },
  {
    label: "Fast new-lead follow-up",
    name: "New-lead speed-to-lead",
    goal: "Contact brand-new leads within minutes. Confirm what they need, set expectations, and book the next step before they go cold.",
    channel: "sms",
    scope: "all_open",
  },
  {
    label: "Call-prep the hot list",
    name: "Daily call prep",
    goal: "For every open deal worth calling today, prepare a tight talk track: the goal, two talking points, and the most likely objection with a response.",
    channel: "call",
    scope: "all_open",
  },
];

export function AgentsView({
  initialTasks,
  initialRuns,
  stages,
  summary,
  guardrails,
}: {
  initialTasks: AgentTask[];
  initialRuns: AgentRun[];
  stages: { id: string; label: string }[];
  summary: Summary;
  guardrails: string[];
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

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand";
  const live = summary.activeAuto > 0;

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setName(t.name);
    setGoal(t.goal);
    setChannel(t.channel);
    setScope(t.scope);
  }

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
    // Only drop it from the list once the delete actually succeeded, so a failed
    // delete doesn't make the task vanish until the next refresh restores it.
    const res = await fetch(`/api/agent/tasks/${id}`, { method: "DELETE" }).catch(() => null);
    if (res && res.ok) setTasks((t) => t.filter((x) => x.id !== id));
    router.refresh();
  }

  async function toggle(id: string, enabled: boolean) {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, enabled } : x))); // optimistic
    setError(null);
    const res = await fetch(`/api/agent/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, enabled: !enabled } : x))); // revert
      setError("Couldn't update the agent — try again.");
    } else {
      router.refresh();
    }
  }

  const taskName = (id: string) => tasks.find((t) => t.id === id)?.name ?? "Task";

  const STATS: { label: string; value: string; icon: IconName; tone?: string }[] = [
    { label: "Active agents", value: String(summary.activeTasks), icon: "autopilot" },
    { label: "Deals worked", value: String(summary.dealsWorked), icon: "pipeline" },
    { label: "Actions taken", value: String(summary.actionsTaken), icon: "sequences" },
    { label: "Recoverable touched", value: compactMoney(summary.recoverableTouched, summary.currency), icon: "recall", tone: "text-brand" },
  ];

  return (
    <div className="space-y-6">
      {/* Command-center header — the autonomous force, at a glance */}
      <section className="raised relative overflow-hidden rounded-2xl border border-border bg-surface p-6">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
                  <Icon name="autopilot" size={20} />
                </span>
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Autopilot</h1>
                  <p className="text-sm text-muted">Your autonomous sales force — describe the job in plain English, it works every deal.</p>
                </div>
              </div>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${live ? "border-brand/40 bg-brand-soft/40 text-brand" : "border-border bg-surface-2 text-muted"}`}>
              <span className="relative flex h-2 w-2">
                {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-brand" : "bg-muted"}`} />
              </span>
              {live ? `${summary.activeAuto} running autonomously` : "Standing by"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted">{s.label}</span>
                  <Icon name={s.icon} size={14} className="text-muted/70" />
                </div>
                <p className={`mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight ${s.tone ?? "text-fg"}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <Icon name="shield" size={13} className="text-brand" /> Guardrails always on
            </span>
            {guardrails.map((gr) => (
              <span key={gr} className="pill bg-surface-2 text-muted">{gr}</span>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <section className="card border-brand/30">
            <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={16} className="text-brand" /> New autopilot task</h2>
            <p className="mt-1 text-xs text-muted">Describe what you want done. Start from a template or write your own.</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className="cta inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-body transition-colors hover:border-brand/40 hover:text-fg"
                >
                  <Icon name={CHANNEL_ICON[t.channel] ?? "recall"} size={11} className="text-brand" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2.5">
              <input className={input} aria-label="Autopilot task name" placeholder="Task name (e.g. Re-engage cold deals)" value={name} onChange={(e) => setName(e.target.value)} />
              <textarea className={`${input} resize-none`} rows={4} aria-label="Task instruction" placeholder="Instruction — e.g. 'Reach out to deals that have gone quiet, reference our last conversation, and offer a 15-minute call this week.'" value={goal} onChange={(e) => setGoal(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select className={input} aria-label="Which deals to work" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="recall_queue">Recall queue</option>
                  <option value="all_open">All open deals</option>
                  {stages.map((s) => <option key={s.id} value={`stage:${s.id}`}>Stage: {s.label}</option>)}
                </select>
                <select className={input} aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="call">Call (talk track)</option>
                  <option value="none">Recommendation only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className={input} aria-label="Autonomy" value={autonomy} onChange={(e) => setAutonomy(e.target.value)}>
                  <option value="review">Review — I approve</option>
                  <option value="auto">Autonomous — send</option>
                </select>
                <select className={input} aria-label="When to run" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                  <option value="manual">Run manually</option>
                  <option value="daily">Daily (auto)</option>
                  <option value="on_idle_deal">When a deal goes idle</option>
                  <option value="on_new_lead">When a lead is created</option>
                </select>
              </div>
              <button onClick={create} disabled={creating || !name.trim() || !goal.trim()} className="cta w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {creating ? "Creating…" : "Create task"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="font-semibold text-fg">Your agents <span className="ml-1 text-sm font-normal text-muted">{tasks.length}</span></h2>
            {tasks.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20"><Icon name="autopilot" size={20} /></span>
                <p className="mt-3 text-sm font-medium text-fg">No agents yet</p>
                <p className="mt-1 text-xs text-muted">Pick a template above and hit Create — your first agent goes to work in seconds.</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {tasks.map((t) => (
                  <li key={t.id} className={`raised lift rounded-xl border border-border bg-surface-2 p-3.5 hover:border-brand/40 ${t.enabled ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-fg">
                        <Icon name={CHANNEL_ICON[t.channel] ?? "recall"} size={14} className="text-brand" />
                        {t.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {!t.enabled && <span className="pill bg-warn/15 text-warn">Paused</span>}
                        <span className={`pill ${t.autonomy === "auto" ? "bg-brand-soft text-brand" : "bg-surface text-muted"}`}>
                          {t.autonomy === "auto" ? "Autonomous" : "Review"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{t.goal}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => run(t.id)} disabled={busy === t.id} className="cta inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        {busy === t.id ? "Running…" : <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg> Run now</>}
                      </button>
                      <button onClick={() => toggle(t.id, !t.enabled)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg" title={t.enabled ? "Pause this agent (stops it running without deleting it)" : "Resume this agent"}>{t.enabled ? "Pause" : "Resume"}</button>
                      <button onClick={() => remove(t.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-danger/40 hover:text-danger">Delete</button>
                      <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{t.scope.startsWith("stage:") ? "Stage" : t.scope.replace("_", " ")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="sequences" size={15} className="text-brand" /> Run ledger</span>
            {runs.length > 0 && <span className="text-xs text-muted">{runs.length} recent {runs.length === 1 ? "run" : "runs"}</span>}
          </div>
          {runs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20"><Icon name="sequences" size={22} /></span>
              <p className="mt-4 text-sm font-semibold text-fg">Nothing run yet</p>
              <p className="mt-1 text-sm text-muted">Create an agent and hit Run — every action it takes is recorded here, deal by deal.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      {taskName(r.taskId)}
                      {r.recoverable > 0 && <span className="text-xs font-normal tabular-nums text-brand">· {compactMoney(r.recoverable, summary.currency)} touched</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {r.ai ? <span className="pill bg-brand-soft text-brand">AI</span> : <span className="pill bg-surface-2 text-muted">templates</span>}
                      <span className={`pill ${r.status === "failed" ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>{r.status}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{r.summary}</p>
                  {r.actions.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
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
    </div>
  );
}
