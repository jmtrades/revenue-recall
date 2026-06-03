"use client";

import { useState } from "react";
import { HOUSE_VOICES, DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

/**
 * Per-org outbound CALL voice. Unlike VoiceControls (on-device read-aloud), this
 * persists to the org and is the voice the AI actually speaks in on real calls —
 * threaded through /api/calls/place → the gateway. Self-hosted Kokoro voices.
 */
export function CallVoicePicker({ initialVoiceId }: { initialVoiceId: string | null }) {
  const [voiceId, setVoiceId] = useState<string>(initialVoiceId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/voice/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setVoiceId(data.voiceId ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium text-fg">Outbound call voice</p>
      <p className="text-xs text-muted">The in-house voice your AI speaks in on real phone calls — self-hosted, no vendor in the loop.</p>
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {HOUSE_VOICES.map((v) => {
          const active = voiceId === v.id || (!voiceId && v.id === DEFAULT_HOUSE_VOICE);
          return (
            <button
              key={v.id}
              onClick={() => choose(v.id)}
              disabled={busy !== null}
              className={`rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${active ? "border-brand bg-brand-soft/30" : "border-border hover:border-brand/40"}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                {v.label}
                {active && <span className="pill bg-brand/15 text-brand text-[10px]">In use</span>}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">{busy === v.id ? "Saving…" : v.description}</span>
            </button>
          );
        })}
      </div>
      {saved && <p className="text-sm text-success">Saved — new calls use this voice.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
