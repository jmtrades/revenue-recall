"use client";

import { useState, useEffect, useRef } from "react";
import { loadVoices, pickVoice, speak, type SpeakHandle } from "@/lib/voice/speech";
import { getSynth } from "@/lib/voice/synth";
import { Icon } from "@/components/icons";
import { loadVoicePrefs, saveVoicePrefs, toVoicePrefs, type StoredVoicePrefs } from "@/lib/voice/prefs";

// A curated set of the in-house neural voices (Kokoro ids) surfaced in the
// picker when the neural backend is connected. The stored value flows through to
// the neural service as the voiceId; "clone:<id>" selects a rep's cloned voice.
const NEURAL_VOICES: { id: string; label: string }[] = [
  { id: "af_heart", label: "Aria — warm female" },
  { id: "af_bella", label: "Bella — bright female" },
  { id: "af_nicole", label: "Nicole — soft female" },
  { id: "am_adam", label: "Adam — steady male" },
  { id: "am_michael", label: "Michael — friendly male" },
  { id: "bf_emma", label: "Emma — British female" },
  { id: "bm_george", label: "George — British male" },
];

export function VoiceControls() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<StoredVoicePrefs>(loadVoicePrefs());
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [neural, setNeural] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-brand";

  useEffect(() => {
    // Neural backend connected? Then offer the in-house neural voices.
    setNeural(getSynth().kind === "neural");
    loadVoices().then(setVoices);
    return () => handleRef.current?.stop();
  }, []);

  function persist(next: StoredVoicePrefs) {
    setPrefs(next);
    saveVoicePrefs(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  async function preview() {
    if (speaking) {
      handleRef.current?.stop();
      setSpeaking(false);
      return;
    }
    const sample = "Hi, this is a quick test of how I'll sound on calls and voicemails.";
    const p = toVoicePrefs(prefs);
    const synth = getSynth();
    let h: SpeakHandle;
    if (synth.kind === "neural") {
      // Neural backend resolves the voice server-side from voiceId/preferName.
      h = await synth.speak(sample, p);
    } else {
      h = speak(sample, p, pickVoice(voices, p));
    }
    handleRef.current = h;
    setSpeaking(true);
    h.done.finally(() => setSpeaking(false));
  }

  const ranked = [...voices].sort((a, b) => Number(b.localService) - Number(a.localService));

  return (
    <div className="space-y-4">
      <div>
        <span className="stat-label">Voice</span>
        <select
          className={`${input} mt-1`}
          value={prefs.voiceName ?? ""}
          onChange={(e) => persist({ ...prefs, voiceName: e.target.value || undefined })}
        >
          <option value="">Auto (best available)</option>
          {neural && (
            <optgroup label="In-house neural voices">
              {NEURAL_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          )}
          {ranked.length > 0 && (
            <optgroup label={neural ? "Browser voices" : "Voices"}>
              {ranked.map((v) => (
                <option key={v.name} value={v.name}>{v.name}{v.localService ? "" : " (online)"}</option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="mt-1 text-xs text-muted">
          {neural
            ? "The in-house neural voice is connected — pick one of ours, or a teammate's cloned voice in Settings."
            : "Using your device's built-in voices. Connect the neural voice service for a higher-fidelity, fully in-house voice."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="stat-label">Rate · {prefs.rate.toFixed(2)}</span>
          <input type="range" min={0.6} max={1.4} step={0.05} value={prefs.rate} onChange={(e) => persist({ ...prefs, rate: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
        </label>
        <label>
          <span className="stat-label">Pitch · {prefs.pitch.toFixed(2)}</span>
          <input type="range" min={0.6} max={1.6} step={0.05} value={prefs.pitch} onChange={(e) => persist({ ...prefs, pitch: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
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
