"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@/lib/crm/types";
import { HumannessMeter } from "@/components/HumannessMeter";
import { SpeakButton } from "@/components/SpeakButton";
import { TONES, DEFAULT_TONE, type ToneId } from "@/lib/tones";

const KINDS: { id: "note" | "call" | "email" | "sms" | "meeting"; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "meeting", label: "Meeting" },
];

export function DealActions({ dealId, stages, currentStageId, canWrite }: { dealId: string; stages: Stage[]; currentStageId: string; canWrite: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("note");
  const [tone, setTone] = useState<ToneId | "auto">("auto");
  const [summary, setSummary] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variations, setVariations] = useState<{ subject?: string; body: string }[]>([]);

  const canDraft = kind === "email" || kind === "sms" || kind === "call";

  async function draft(opts: { count?: number; scenario?: "voicemail" | "breakup" | "referral" | "recap" | "renewal" | "reschedule" } = {}) {
    const count = opts.count ?? 1;
    setDrafting(true);
    setError(null);
    setVariations([]);
    try {
      const res = await fetch(`/api/ai/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          channel: opts.scenario === "voicemail" ? "call" : kind,
          tone,
          ...(opts.scenario ? { scenario: opts.scenario } : {}),
          ...(count > 1 ? { variations: count } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Draft failed");
      if (body.variations) {
        const list = body.variations as { subject?: string; body: string }[];
        if (list.length > 0) {
          setSummary(list[0].body);
          setSubject(list[0].subject ?? "");
          if (list.length > 1) setVariations(list);
        }
      } else {
        setSummary(body.body);
        setSubject(body.subject ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  function applyVariation(v: { subject?: string; body: string }) {
    setSummary(v.body);
    setSubject(v.subject ?? "");
  }

  async function move(stageId: string) {
    setError(null);
    const res = await fetch(`/api/opportunities/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Move failed");
    else startTransition(() => router.refresh());
  }

  async function log() {
    if (!summary.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Fold the subject into the logged email body so it isn't lost (mirrors
      // /api/messages/send). Other channels have no subject.
      const composed = kind === "email" && subject.trim() ? `${subject.trim()}\n\n${summary}` : summary;
      const res = await fetch(`/api/opportunities/${dealId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, summary: composed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      setSummary("");
      setSubject("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="stat-label">Stage</label>
        <select
          value={currentStageId}
          disabled={!canWrite}
          onChange={(e) => move(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-60"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="stat-label">Log activity</label>
          {canDraft && (
            <div className="flex items-center gap-1.5">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneId | "auto")}
                title="Voice / tone for the AI draft"
                aria-label="Draft tone"
                className="rounded-lg border border-border bg-surface px-2 py-0.5 text-xs text-muted outline-none focus:border-brand"
              >
                <option value="auto">Auto (from deal)</option>
                {TONES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <button
                onClick={() => draft()}
                disabled={drafting}
                className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand-soft/30 px-2 py-0.5 text-xs font-medium text-brand transition hover:bg-brand-soft/50 disabled:opacity-50"
              >
                {drafting ? "Drafting…" : "✨ Draft with AI"}
              </button>
              <button
                onClick={() => draft({ count: 3 })}
                disabled={drafting}
                title="Generate three distinct takes to choose from"
                className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted transition hover:text-fg disabled:opacity-50"
              >
                3 takes
              </button>
            </div>
          )}
        </div>
        {canDraft && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted">Quick:</span>
            <button onClick={() => draft({ scenario: "voicemail" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">📞 Voicemail</button>
            <button onClick={() => draft({ scenario: "recap" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">📝 Recap</button>
            <button onClick={() => draft({ scenario: "reschedule" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">↻ Reschedule</button>
            <button onClick={() => draft({ scenario: "referral" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">🙌 Referral</button>
            <button onClick={() => draft({ scenario: "renewal" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">🔁 Renewal</button>
            <button onClick={() => draft({ scenario: "breakup" })} disabled={drafting} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-fg disabled:opacity-50">👋 Breakup</button>
          </div>
        )}
        {variations.length > 1 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] text-muted">Pick the one that sounds most like you:</p>
            {variations.map((v, i) => (
              <button
                key={i}
                onClick={() => applyVariation(v)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                  summary === v.body ? "border-brand bg-brand-soft/20 text-fg" : "border-border bg-surface-2 text-muted hover:text-fg"
                }`}
              >
                {v.subject && <span className="block font-medium text-fg">{v.subject}</span>}
                <span className="line-clamp-3 whitespace-pre-wrap">{v.body}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-lg px-2.5 py-1 text-xs ${kind === k.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-white"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === "email" && subject && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          />
        )}
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What happened? Or click ✨ Draft with AI."
          rows={4}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        />
        {canDraft && <HumannessMeter text={summary} />}
        {canDraft && summary.trim() && (
          <div className="mt-1 flex justify-end">
            <SpeakButton text={summary} label="Hear it" />
          </div>
        )}
        <button
          onClick={log}
          disabled={busy || !summary.trim()}
          className="mt-2 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Log activity"}
        </button>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
