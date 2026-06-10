"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { summarizeRule } from "@/lib/automations/custom-summary";
import type { Action, Condition, ConditionField, ConditionOp, CustomAutomation, CustomTriggerKind } from "@/lib/automations/custom-types";

/**
 * Settings → Automations → custom rules. Build "when a deal hits this transition
 * (with these conditions), do these actions" rules that the engine executes.
 */

const field = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus:border-brand";

interface Props {
  initial: CustomAutomation[];
  stages: { id: string; label: string }[];
  sequences: { id: string; name: string }[];
  canManage: boolean;
}

interface Draft {
  id?: string;
  name: string;
  triggerKind: CustomTriggerKind;
  stageId: string;
  conditions: Condition[];
  actions: Action[];
}

const TRIGGERS: { value: CustomTriggerKind; label: string }[] = [
  { value: "stage_changed", label: "Deal moves to a stage" },
  { value: "deal_won", label: "Deal is won" },
  { value: "deal_lost", label: "Deal is lost" },
  { value: "lead_created", label: "A new lead is created" },
];

const OPS_BY_FIELD: Record<ConditionField, ConditionOp[]> = {
  value: ["gt", "gte", "lt", "lte", "eq"],
  source: ["eq", "contains"],
  pipeline: ["eq", "contains"],
};
const OP_LABEL: Record<ConditionOp, string> = { eq: "is", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "contains" };

const emptyDraft = (): Draft => ({ name: "", triggerKind: "stage_changed", stageId: "", conditions: [], actions: [{ type: "create_task", title: "" }] });

export function CustomAutomationsManager({ initial, stages, sequences, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageName = (id: string) => stages.find((s) => s.id === id)?.label ?? id;
  const seqName = (id: string) => sequences.find((s) => s.id === id)?.name ?? id;
  const labels = { stage: stageName, sequence: seqName };

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/custom", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the rule.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Couldn't save — check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) return setError("Give the rule a name.");
    if (form.actions.length === 0) return setError("Add at least one action.");
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      triggerKind: form.triggerKind,
      stageId: form.triggerKind === "stage_changed" && form.stageId ? form.stageId : null,
      conditions: form.conditions,
      actions: form.actions,
    };
    const ok = await mutate(form.id ? "PATCH" : "POST", payload);
    if (ok) setForm(null);
  }

  if (!canManage) {
    return <div className="card text-sm text-muted">Only an owner or admin can create custom automations.</div>;
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-fg">Custom rules</h2>
          <p className="mt-0.5 text-sm text-muted">Your own trigger → action rules. They run alongside the presets above.</p>
        </div>
        {!form && (
          <button onClick={() => { setForm(emptyDraft()); setError(null); }} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/90">
            New rule
          </button>
        )}
      </div>

      {form && <Builder form={form} setForm={setForm} stages={stages} sequences={sequences} onSave={save} onCancel={() => { setForm(null); setError(null); }} busy={busy} error={error} />}

      <div className="mt-4 space-y-2">
        {initial.length === 0 && !form && <p className="text-sm text-muted">No custom rules yet. Presets handle the basics; add a rule for anything specific to how you sell.</p>}
        {initial.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{r.name}</span>
                {!r.enabled && <span className="pill bg-surface-2 text-muted">paused</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{summarizeRule(r, labels)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => mutate("PATCH", { id: r.id, enabled: !r.enabled })} disabled={busy} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
                {r.enabled ? "Pause" : "Resume"}
              </button>
              <button onClick={() => { setForm({ id: r.id, name: r.name, triggerKind: r.triggerKind, stageId: r.stageId ?? "", conditions: r.conditions, actions: r.actions.length ? r.actions : [{ type: "create_task", title: "" }] }); setError(null); }} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg">
                Edit
              </button>
              <button onClick={() => { if (window.confirm(`Delete the "${r.name}" rule?`)) void mutate("DELETE", { id: r.id }); }} disabled={busy} className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && !form && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function Builder({
  form,
  setForm,
  stages,
  sequences,
  onSave,
  onCancel,
  busy,
  error,
}: {
  form: Draft;
  setForm: (d: Draft) => void;
  stages: { id: string; label: string }[];
  sequences: { id: string; name: string }[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  const setCondition = (i: number, c: Condition) => setForm({ ...form, conditions: form.conditions.map((x, idx) => (idx === i ? c : x)) });
  const setAction = (i: number, a: Action) => setForm({ ...form, actions: form.actions.map((x, idx) => (idx === i ? a : x)) });

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface-2 p-3">
      <input className={`${field} w-full`} placeholder="Rule name (e.g. Big win → alert me)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Rule name" />

      {/* Trigger */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-brand-soft text-brand">When</span>
        <select className={field} value={form.triggerKind} onChange={(e) => setForm({ ...form, triggerKind: e.target.value as CustomTriggerKind })} aria-label="Trigger">
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {form.triggerKind === "stage_changed" && (
          <select className={field} value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })} aria-label="Stage">
            <option value="">any stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {form.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="pill bg-surface text-muted">{i === 0 ? "if" : "and"}</span>
            <select
              className={field}
              value={c.field}
              onChange={(e) => {
                const f = e.target.value as ConditionField;
                setCondition(i, { field: f, op: OPS_BY_FIELD[f][0], value: f === "value" ? 0 : "" });
              }}
              aria-label="Condition field"
            >
              <option value="value">deal value</option>
              <option value="source">source</option>
              <option value="pipeline">pipeline</option>
            </select>
            <select className={field} value={c.op} onChange={(e) => setCondition(i, { ...c, op: e.target.value as ConditionOp })} aria-label="Condition operator">
              {OPS_BY_FIELD[c.field].map((op) => (
                <option key={op} value={op}>{OP_LABEL[op]}</option>
              ))}
            </select>
            {c.field === "value" ? (
              <input type="number" className={`${field} w-28`} value={Number(c.value)} onChange={(e) => setCondition(i, { ...c, value: Number(e.target.value) })} aria-label="Condition value" />
            ) : (
              <input className={`${field} w-40`} value={String(c.value)} onChange={(e) => setCondition(i, { ...c, value: e.target.value })} aria-label="Condition value" />
            )}
            <button onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, idx) => idx !== i) })} className="text-xs text-muted hover:text-danger" aria-label="Remove condition">✕</button>
          </div>
        ))}
        <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: "value", op: "gt", value: 0 }] })} className="text-xs font-medium text-brand hover:underline">
          + Add condition
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {form.actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="pill bg-brand-soft text-brand">do</span>
            <select
              className={field}
              value={a.type}
              onChange={(e) => {
                const t = e.target.value as Action["type"];
                setAction(i, t === "create_task" ? { type: "create_task", title: "" } : t === "enroll_sequence" ? { type: "enroll_sequence", sequenceId: sequences[0]?.id ?? "" } : { type: "notify_owner" });
              }}
              aria-label="Action type"
            >
              <option value="create_task">create a task</option>
              <option value="enroll_sequence">enroll in a sequence</option>
              <option value="notify_owner">notify the owner</option>
            </select>
            {a.type === "create_task" && (
              <>
                <input className={`${field} w-48`} placeholder="Task title" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} aria-label="Task title" />
                <input type="number" min={0} max={365} className={`${field} w-24`} placeholder="due +days" value={a.dueInDays ?? ""} onChange={(e) => setAction(i, { ...a, dueInDays: e.target.value ? Number(e.target.value) : undefined })} aria-label="Due in days" />
              </>
            )}
            {a.type === "enroll_sequence" &&
              (sequences.length ? (
                <select className={field} value={a.sequenceId} onChange={(e) => setAction(i, { ...a, sequenceId: e.target.value })} aria-label="Sequence">
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">No sequences yet — create one first.</span>
              ))}
            {a.type === "notify_owner" && (
              <input className={`${field} w-56`} placeholder="Message (optional)" value={a.message ?? ""} onChange={(e) => setAction(i, { ...a, message: e.target.value })} aria-label="Notify message" />
            )}
            {form.actions.length > 1 && (
              <button onClick={() => setForm({ ...form, actions: form.actions.filter((_, idx) => idx !== i) })} className="text-xs text-muted hover:text-danger" aria-label="Remove action">✕</button>
            )}
          </div>
        ))}
        <button onClick={() => setForm({ ...form, actions: [...form.actions, { type: "create_task", title: "" }] })} className="text-xs font-medium text-brand hover:underline">
          + Add action
        </button>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          {busy ? "Saving…" : form.id ? "Save changes" : "Create rule"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-fg">Cancel</button>
      </div>
    </div>
  );
}
