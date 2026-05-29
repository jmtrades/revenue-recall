"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function VoiceStudio({
  initial,
  persisted,
}: {
  initial: { senderName?: string; role?: string; signature?: string; samples?: string; profile?: string; customNextSteps?: string[]; customReengage?: string[] };
  persisted: boolean;
}) {
  const router = useRouter();
  const [senderName, setSenderName] = useState(initial.senderName ?? "");
  const [signature, setSignature] = useState(initial.signature ?? "");
  const [samples, setSamples] = useState(initial.samples ?? "");
  const [profile, setProfile] = useState(initial.profile ?? "");
  const [customNextSteps, setCustomNextSteps] = useState((initial.customNextSteps ?? []).join("\n"));
  const [customReengage, setCustomReengage] = useState((initial.customReengage ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";
  const canSave = Boolean(samples.trim() || customNextSteps.trim() || customReengage.trim());

  async function learn() {
    if (!canSave) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      const res = await fetch("/api/voice/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName, signature, samples, customNextSteps, customReengage }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed");
      setProfile(b.profile ?? "");
      setStatus(b.aiDistilled ? "Voice learned — every message now sounds like you." : "Saved. Add an API key for AI-distilled voice; using your text as-is for now.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="autopilot" size={16} className="text-brand" /> Your voice</h2>
      <p className="mt-1 text-sm text-muted">
        No forms. Just describe how you sound, or paste a few of your real emails/texts — the AI learns your voice so every
        message reads like <em>you</em>, never like an AI.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Your name (e.g. Sam)" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
        <input className={input} placeholder="Sign-off (e.g. — Sam, Acme Realty)" value={signature} onChange={(e) => setSignature(e.target.value)} />
      </div>
      <textarea
        className={`${input} mt-2 resize-none`}
        rows={6}
        placeholder={"Describe your style, or paste 2–3 of your own messages. e.g.\n\"I keep it short and friendly, lowercase, no corporate fluff. I usually open with 'hey [name]' and sign off 'cheers'. I get to the point fast and always offer an easy out.\""}
        value={samples}
        onChange={(e) => setSamples(e.target.value)}
      />
      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <label className="stat-label">Your go-to next steps</label>
          <p className="mt-0.5 text-xs text-muted">One per line. Used in drafts instead of the industry defaults.</p>
          <textarea
            className={`${input} mt-1.5 resize-none`}
            rows={4}
            placeholder={"want me to grab you a showing this weekend?\nfree for a quick call this week?\nwant me to send the numbers over?"}
            value={customNextSteps}
            onChange={(e) => setCustomNextSteps(e.target.value)}
          />
        </div>
        <div>
          <label className="stat-label">Your re-engagement openers</label>
          <p className="mt-0.5 text-xs text-muted">One per line. Used when a deal&apos;s gone cold.</p>
          <textarea
            className={`${input} mt-1.5 resize-none`}
            rows={4}
            placeholder={"saw a couple new listings and thought of you\nyour search has been quiet — still looking?\nwanted to check before this drops off my list"}
            value={customReengage}
            onChange={(e) => setCustomReengage(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={learn} disabled={busy || !canSave} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save my voice"}
        </button>
        {status && <span className="text-sm text-success">{status}</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
        {!persisted && <span className="text-xs text-muted">Connect a database to save your voice.</span>}
      </div>

      {profile && (
        <div className="mt-4">
          <p className="stat-label">Your voice profile (what the AI follows)</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-3 font-sans text-sm leading-relaxed text-muted">{profile}</pre>
        </div>
      )}
    </div>
  );
}
