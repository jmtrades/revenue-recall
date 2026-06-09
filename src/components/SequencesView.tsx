"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Sequence, SeqChannel } from "@/lib/sequences";
import { ChannelBadge } from "@/components/ui";

interface StepDraft {
  day: string;
  channel: SeqChannel;
  subject: string;
  body: string;
}

interface SeqDraft {
  id?: string; // set when editing an existing custom sequence
  name: string;
  goal: string;
  steps: StepDraft[];
}

const NEW_STEP: StepDraft = { day: "0", channel: "email", subject: "", body: "" };
const EMPTY: SeqDraft = { name: "", goal: "", steps: [{ ...NEW_STEP }] };

/**
 * Sequence library + authoring. Presets stay read-only; org-authored sequences
 * (customIds) get Edit/Delete. The editor writes the exact SequenceStep shape
 * the cadence runtime executes, so a saved sequence is enrollable immediately.
 */
export function SequencesView({ sequences, customIds = [], canAuthor = false }: { sequences: Sequence[]; customIds?: string[]; canAuthor?: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<SeqDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customSet = new Set(customIds);

  function startEdit(seq: Sequence) {
    setDraft({
      id: seq.id,
      name: seq.name,
      goal: seq.goal,
      steps: seq.steps.map((s) => ({ day: String(s.day), channel: s.channel, subject: s.subject ?? "", body: s.body })),
    });
    setError(null);
  }

  async function save() {
    if (!draft) return;
    const steps = draft.steps
      .filter((s) => s.body.trim())
      .map((s) => ({ day: Math.max(0, Math.round(Number(s.day) || 0)), channel: s.channel, subject: s.subject.trim() || undefined, body: s.body.trim() }));
    if (!draft.name.trim() || steps.length === 0) {
      setError("A sequence needs a name and at least one step with a message.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sequences/manage", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), goal: draft.goal.trim() || undefined, steps }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the sequence.");
        return;
      }
      setDraft(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save the sequence — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" sequence? Anyone currently enrolled is stopped. This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sequences/manage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete the sequence.");
      else startTransition(() => router.refresh());
    } catch {
      setError("Couldn't delete the sequence — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <div>
      {canAuthor && !draft && (
        <div className="mb-5">
          <button onClick={() => { setDraft({ ...EMPTY, steps: [{ ...NEW_STEP }] }); setError(null); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90">
            New sequence
          </button>
        </div>
      )}

      {draft && (
        <section className="card mb-6">
          <h2 className="mb-3 font-semibold text-fg">{draft.id ? "Edit sequence" : "New sequence"}</h2>
          <div className="space-y-3">
            <input className={input} placeholder="Sequence name (e.g. Post-demo follow-up)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Sequence name" />
            <input className={input} placeholder="Goal — what this cadence is trying to land (optional)" value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} aria-label="Sequence goal" />
            <div className="space-y-3">
              {draft.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">Step {i + 1}</span>
                    <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                      Day
                      <input type="number" min={0} max={90} value={s.day} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)) })} className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg outline-none focus:border-brand" aria-label={`Step ${i + 1} day`} />
                    </label>
                    <select value={s.channel} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, channel: e.target.value as SeqChannel } : x)) })} className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg outline-none focus:border-brand" aria-label={`Step ${i + 1} channel`}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="call">Call</option>
                    </select>
                    {draft.steps.length > 1 && (
                      <button onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`} className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:text-fg">
                        Remove
                      </button>
                    )}
                  </div>
                  {s.channel === "email" && (
                    <input className={`${input} mb-2`} placeholder="Subject / step title" value={s.subject} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })} aria-label={`Step ${i + 1} subject`} />
                  )}
                  <textarea
                    className={`${input} resize-none`}
                    rows={3}
                    placeholder="What this step should say or do — the AI drafts each send from this brief, in your voice."
                    value={s.body}
                    onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
                    aria-label={`Step ${i + 1} message`}
                  />
                </div>
              ))}
            </div>
            {draft.steps.length < 12 && (
              <button onClick={() => setDraft({ ...draft, steps: [...draft.steps, { ...NEW_STEP, day: String((Number(draft.steps[draft.steps.length - 1]?.day) || 0) + 3) }] })} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg">
                + Add step
              </button>
            )}
            {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
                {busy ? "Saving…" : draft.id ? "Save changes" : "Create sequence"}
              </button>
              <button onClick={() => { setDraft(null); setError(null); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-fg">Cancel</button>
            </div>
          </div>
        </section>
      )}

      {!draft && error && <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {sequences.map((seq) => (
          <section key={seq.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="flex items-center gap-2">
                  <Link href={`/sequences/${seq.id}`} className="font-semibold text-fg hover:underline">{seq.name}</Link>
                  {customSet.has(seq.id) && <span className="pill bg-brand-soft text-brand">Custom</span>}
                </span>
                <p className="mt-1 text-sm text-muted">{seq.goal}</p>
              </div>
              <span className="pill bg-surface-2 text-muted">{seq.steps.length} steps</span>
            </div>
            <ol className="mt-4 space-y-3">
              {seq.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs text-muted">{i + 1}</span>
                    <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">Day {step.day}</span>
                  </div>
                  <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <ChannelBadge channel={step.channel} />
                      <span className="truncate text-sm font-medium text-fg">{step.subject}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <Link href={`/sequences/${seq.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand transition hover:text-brand/80">
                Start this cadence <span aria-hidden>→</span>
              </Link>
              {canAuthor && customSet.has(seq.id) && (
                <span className="flex items-center gap-2">
                  <button onClick={() => startEdit(seq)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg">Edit</button>
                  <button onClick={() => remove(seq.id, seq.name)} disabled={busy} className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50">Delete</button>
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
