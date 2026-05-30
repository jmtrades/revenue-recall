"use client";

import { useEffect, useRef, useState } from "react";
import { isSpeechSupported, loadVoices, pickVoice, speak, type SpeakHandle } from "@/lib/voice/speech";
import { getSynth } from "@/lib/voice/synth";
import { Icon } from "@/components/icons";
import { loadVoicePrefs, saveVoicePrefs, toVoicePrefs, type StoredVoicePrefs } from "@/lib/voice/prefs";

const SAMPLE = "Hey Jordan, it's me — caught you at an okay time? Wanted to run something by you real quick.";

// Curated in-house neural voices (Kokoro ids), shown only when the neural
// backend is connected. The stored value flows to the service as the voiceId.
const NEURAL_VOICES: { id: string; label: string }[] = [
  { id: "af_heart", label: "Aria — warm female" },
  { id: "af_bella", label: "Bella — bright female" },
  { id: "af_nicole", label: "Nicole — soft female" },
  { id: "am_adam", label: "Adam — steady male" },
  { id: "am_michael", label: "Michael — friendly male" },
  { id: "bf_emma", label: "Emma — British female" },
  { id: "bm_george", label: "George — British male" },
];

/**
 * Tune the spoken voice: pick a voice and set speed/pitch, preview it, and save
 * on-device. Every spoken surface (briefs, drafts, call prep, role-play) then
 * uses these settings. When the in-house neural service is connected, its voices
 * appear here too and preview routes through it; otherwise it's the browser
 * engine, fully on-device.
 */
export function VoiceControls() {
  const [supported, setSupported] = useState(false);
  const [neural, setNeural] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<StoredVoicePrefs>({ rate: 1, pitch: 1 });
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    const isNeural = getSynth().kind === "neural";
    setNeural(isNeural);
    const ok = isNeural || isSpeechSupported();
    setSupported(ok);
    if (ok) {
      setPrefs(loadVoicePrefs());
      loadVoices().then(setVoices);
    }
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
    const p = toVoicePrefs(prefs);
    const synth = getSynth();
    let h: SpeakHandle;
    if (synth.kind === "neural") {
      h = await synth.speak(SAMPLE, p); // neural backend resolves the voice from voiceId/preferName
    } else {
      h = speak(SAMPLE, p, pickVoice(voices, p));
    }
    handleRef.current = h;
    setSpeaking(true);
    h.done.finally(() => setSpeaking(false));
  }

  if (!supported) {
    return (
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium text-fg">Spoken voice</p>
        <p className="mt-1 text-xs text-muted">Your browser doesn&apos;t support on-device speech synthesis. The written voice still works everywhere.</p>
      </div>
    );
  }

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const list = english.length ? english : voices;

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Spoken voice</p>
        <p className="mt-0.5 text-xs text-muted">
          {neural
            ? "The in-house neural voice is connected — pick one of ours below, or a teammate's cloned voice. Higher fidelity, fully in-house."
            : "Used when the app reads briefs, drafts, and call prep aloud, and in call role-play. On-device — nothing leaves your machine."}
        </p>
      </div>

      <div>
        <label className="stat-label">Voice</label>
        <select
          value={prefs.voiceName ?? ""}
          onChange={(e) => update({ voiceName: e.target.value || undefined })}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        >
          <option value="">Auto (most natural available)</option>
          {neural && (
            <optgroup label="In-house neural voices">
              {NEURAL_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          )}
          {list.length > 0 && (
            <optgroup label={neural ? "Browser voices" : "Voices"}>
              {list.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="stat-label">Speed · {prefs.rate.toFixed(2)}×</span>
          <input type="range" min={0.6} max={1.4} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
        </label>
        <label className="block">
          <span className="stat-label">Pitch · {prefs.pitch.toFixed(2)}</span>
          <input type="range" min={0.6} max={1.6} step={0.05} value={prefs.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
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
