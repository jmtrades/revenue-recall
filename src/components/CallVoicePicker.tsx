"use client";

import { useEffect, useRef, useState } from "react";
import { HOUSE_VOICES, DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";
import { ensureLocalVoice, localSynth } from "@/lib/voice/local";
import { browserSynth } from "@/lib/voice/synth";
import type { SpeakHandle } from "@/lib/voice/speech";

// What a voice says when previewed — a real call opener, so "how it sounds on
// a call" is exactly what you hear, not "the quick brown fox".
const PREVIEW_LINE = "Hi, it's {name} calling from Northwind — I know it's been a minute, but I've got something worth thirty seconds. Is now okay?";

// Group the catalog the same way the provider-fallback logic does (id prefix)
// — 23 voices read as a curated set of four sections, not one wall of buttons.
const VOICE_GROUPS: { prefix: string; label: string }[] = [
  { prefix: "af", label: "Female · US" },
  { prefix: "am", label: "Male · US" },
  { prefix: "bf", label: "Female · UK" },
  { prefix: "bm", label: "Male · UK" },
];

/**
 * Per-org outbound CALL voice. Unlike VoiceControls (on-device read-aloud), this
 * persists to the org and is the voice the AI actually speaks in on real calls —
 * threaded through /api/calls/place → the gateway. Self-hosted Kokoro voices,
 * which is also what the ▶ preview plays, so what you hear is what you get.
 */
export function CallVoicePicker({ initialVoiceId }: { initialVoiceId: string | null }) {
  const [voiceId, setVoiceId] = useState<string>(initialVoiceId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [warming, setWarming] = useState<string | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => () => handleRef.current?.stop(), []);

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

  async function preview(id: string, label: string) {
    // Tapping the playing voice stops it.
    if (previewing === id) {
      handleRef.current?.stop();
      handleRef.current = null;
      setPreviewing(null);
      return;
    }
    handleRef.current?.stop();
    setWarming(id);
    const ok = await ensureLocalVoice();
    setWarming(null);
    const synth = ok && localSynth.available() ? localSynth : browserSynth;
    setPreviewing(id);
    const handle = await synth.speak(PREVIEW_LINE.replace("{name}", label), { voiceId: id, emotion: "warm" });
    handleRef.current = handle;
    handle.done.then(() => {
      if (handleRef.current === handle) {
        handleRef.current = null;
        setPreviewing(null);
      }
    });
  }

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium text-fg">Outbound call voice</p>
      <p className="text-xs text-muted">The in-house voice your AI speaks in on real phone calls — tap ▶ to hear each one say a real opener.</p>
      {VOICE_GROUPS.map((g) => (
        <div key={g.prefix} className="mt-3 first:mt-1">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted/70">{g.label}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HOUSE_VOICES.filter((v) => v.id.startsWith(`${g.prefix}_`)).map((v) => {
          const active = voiceId === v.id || (!voiceId && v.id === DEFAULT_HOUSE_VOICE);
          const isPreviewing = previewing === v.id;
          const isWarming = warming === v.id;
          return (
            <div
              key={v.id}
              className={`flex items-stretch gap-1 rounded-lg border transition ${active ? "border-brand bg-brand-soft/30" : "border-border hover:border-brand/40"}`}
            >
              <button
                onClick={() => choose(v.id)}
                disabled={busy !== null}
                className="min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  {v.label}
                  {active && <span className="pill bg-brand/15 text-brand text-[10px]">In use</span>}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{busy === v.id ? "Saving…" : v.description}</span>
              </button>
              <button
                onClick={() => preview(v.id, v.label)}
                aria-label={isPreviewing ? `Stop ${v.label} preview` : `Preview ${v.label}`}
                className={`grid w-9 flex-none place-items-center rounded-r-lg border-l text-brand transition-colors ${active ? "border-brand/30" : "border-border"} hover:bg-brand-soft/40`}
              >
                {isWarming ? (
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                ) : isPreviewing ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
            </div>
          );
            })}
          </div>
        </div>
      ))}
      {saved && <p className="text-sm text-success">Saved — new calls use this voice.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
