"use client";

import { useEffect, useRef, useState } from "react";
import { isSpeechSupported, loadVoices, pickVoice, speak, type SpeakHandle } from "@/lib/voice/speech";
import { loadVoicePrefs, saveVoicePrefs, toVoicePrefs, type StoredVoicePrefs } from "@/lib/voice/prefs";

const SAMPLE = "Hey Jordan, it's me — caught you at an okay time? Wanted to run something by you real quick.";

/**
 * Tune the in-house spoken voice: pick an installed voice and set speed/pitch,
 * preview it, and save on-device. Every spoken surface (briefs, drafts, call
 * prep, role-play) then uses these settings. Browser-native, nothing leaves the
 * device.
 */
export function VoiceControls() {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<StoredVoicePrefs>({ rate: 1, pitch: 1 });
  const [speaking, setSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    const ok = isSpeechSupported();
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

  function preview() {
    if (speaking) {
      handleRef.current?.stop();
      setSpeaking(false);
      return;
    }
    const voice = pickVoice(voices, toVoicePrefs(prefs));
    const h = speak(SAMPLE, toVoicePrefs(prefs), voice);
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
        <p className="mt-0.5 text-xs text-muted">Used when the app reads briefs, drafts, and call prep aloud, and in call role-play. On-device — nothing leaves your machine.</p>
      </div>

      <div>
        <label className="stat-label">Voice</label>
        <select
          value={prefs.voiceName ?? ""}
          onChange={(e) => update({ voiceName: e.target.value || undefined })}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        >
          <option value="">Auto (most natural available)</option>
          {list.map((v) => (
            <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
          ))}
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
        <button onClick={preview} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90">
          {speaking ? "■ Stop" : "▶ Preview"}
        </button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}
