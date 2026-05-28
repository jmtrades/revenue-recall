"use client";

import { useEffect, useRef, useState } from "react";
import { isSpeechSupported, loadVoices, pickVoice, speak, type SpeakHandle } from "@/lib/voice/speech";
import { loadVoicePrefs, toVoicePrefs } from "@/lib/voice/prefs";

/**
 * Read any text aloud with the rep's tuned, in-house voice. One component so the
 * same voice powers every surface — briefs, drafts, call prep, role-play. All
 * synthesis is browser-native; nothing leaves the device.
 */
export function SpeakButton({ text, label = "Listen", className = "" }: { text: string; label?: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    setSupported(isSpeechSupported());
    return () => handleRef.current?.stop();
  }, []);

  async function toggle() {
    if (speaking) {
      handleRef.current?.stop();
      setSpeaking(false);
      return;
    }
    const clean = text.trim();
    if (!clean) return;
    const voices = await loadVoices();
    const prefs = loadVoicePrefs();
    const voice = pickVoice(voices, toVoicePrefs(prefs));
    const handle = speak(clean, toVoicePrefs(prefs), voice);
    handleRef.current = handle;
    setSpeaking(true);
    handle.done.finally(() => setSpeaking(false));
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={speaking ? "Stop" : "Read aloud in your voice"}
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      className={`inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs text-muted transition hover:text-fg ${className}`}
    >
      {speaking ? "■ Stop" : `▶ ${label}`}
    </button>
  );
}
