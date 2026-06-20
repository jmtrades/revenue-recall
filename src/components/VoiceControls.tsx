"use client";

import { useEffect, useRef, useState } from "react";
import { getSynth } from "@/lib/voice/synth";
import type { SpeakHandle } from "@/lib/voice/speech";
import { Icon } from "@/components/icons";
import { loadVoicePrefs, saveVoicePrefs, toVoicePrefs, type StoredVoicePrefs } from "@/lib/voice/prefs";

const SAMPLE = "Hey Jordan, it's me — caught you at an okay time? Wanted to run something by you real quick.";

// House voices — each maps to a distinct ElevenLabs voice (see ELEVEN_VOICES in
// lib/voice/tts.ts). The stored value flows to the server as the voiceId.
const VOICES: { id: string; label: string }[] = [
  { id: "af_heart", label: "Aria — warm female" },
  { id: "af_nicole", label: "Nicole — soft female" },
  { id: "af_nova", label: "Nova — bright female" },
  { id: "am_adam", label: "Adam — steady male" },
  { id: "am_michael", label: "Michael — friendly male" },
  { id: "bf_emma", label: "Emma — British female" },
  { id: "bm_george", label: "George — British male" },
];

/**
 * Tune the spoken voice: pick an ElevenLabs voice and set the speaking speed,
 * preview it, and save. Every spoken surface (briefs, drafts, call prep,
 * role-play) then uses these settings. Voice is ElevenLabs-only — when no
 * ElevenLabs key is configured the controls show how to enable it (there is no
 * browser / on-device fallback voice).
 */
export function VoiceControls() {
  const [available, setAvailable] = useState(false);
  const [prefs, setPrefs] = useState<StoredVoicePrefs>({ rate: 1, pitch: 1 });
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    const synth = getSynth();
    setAvailable(synth.kind === "neural" && synth.available());
    setPrefs(loadVoicePrefs());
    return () => handleRef.current?.stop();
  }, []);

  function update(patch: Partial<StoredVoicePrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveVoicePrefs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function preview() {
    if (speaking) {
      handleRef.current?.stop();
      setSpeaking(false);
      return;
    }
    const synth = getSynth();
    if (!synth.available()) return; // ElevenLabs-only: nothing to preview with
    const h = await synth.speak(SAMPLE, toVoicePrefs(prefs));
    handleRef.current = h;
    setSpeaking(true);
    h.done.finally(() => setSpeaking(false));
  }

  if (!available) {
    return (
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium text-fg">Spoken voice</p>
        <p className="mt-1 text-xs text-muted">Add an ElevenLabs key to hear briefs, drafts, and call prep read aloud. The written voice works everywhere.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Spoken voice</p>
        <p className="mt-0.5 text-xs text-muted">
          ElevenLabs is connected — pick a voice below (or a teammate&rsquo;s cloned voice) and tune the speed. This is the voice it speaks in everywhere: briefs, drafts, call prep, and role-play.
        </p>
      </div>

      <div>
        <label className="stat-label">Voice</label>
        <select
          value={prefs.voiceName ?? ""}
          onChange={(e) => update({ voiceName: e.target.value || undefined })}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        >
          <option value="">Auto (your saved voice)</option>
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block">
          <span className="stat-label">Speed · {prefs.rate.toFixed(2)}×</span>
          <input type="range" min={0.6} max={1.4} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={preview} className="cta inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
          <Icon name={speaking ? "stop" : "play"} size={12} fill="currentColor" stroke="none" />
          {speaking ? "Stop" : "Preview"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Icon name="approvals" size={13} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
