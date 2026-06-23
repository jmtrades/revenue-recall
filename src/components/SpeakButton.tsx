"use client";

import { useEffect, useRef, useState } from "react";
import { isSpeechSupported, loadVoices, pickVoice, speak, type SpeakHandle } from "@/lib/voice/speech";
import { getSynth } from "@/lib/voice/synth";
import { Icon } from "@/components/icons";
import { loadVoicePrefs, toVoicePrefs } from "@/lib/voice/prefs";

/**
 * Read any text aloud with the rep's tuned voice. One component so the same
 * voice powers every surface — briefs, drafts, call prep, role-play. Resolves
 * the active backend through getSynth(): the ElevenLabs voice when it's
 * registered and healthy; otherwise it stays disabled (there is no browser
 * fallback voice). Nothing about the UI changes when the backend is configured.
 */
export function SpeakButton({ text, label = "Listen", className = "" }: { text: string; label?: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    // Supported if either the neural backend or the browser engine can speak.
    setSupported(getSynth().available() || isSpeechSupported());
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
    const prefs = toVoicePrefs(loadVoicePrefs());
    const synth = getSynth();
    try {
      let handle: SpeakHandle;
      if (synth.kind === "neural") {
        // Neural backend handles its own voice selection server-side.
        handle = await synth.speak(clean, prefs);
      } else {
        const voice = pickVoice(await loadVoices(), prefs);
        handle = speak(clean, prefs, voice);
      }
      handleRef.current = handle;
      setSpeaking(true);
      handle.done.finally(() => setSpeaking(false));
    } catch {
      // The voice backend hiccuped (network/permission). Reset cleanly rather
      // than leaving an unhandled rejection and a click that did nothing.
      setSpeaking(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={speaking ? "Stop" : "Read aloud in your voice"}
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:border-brand/40 hover:text-fg ${className}`}
    >
      <Icon name={speaking ? "stop" : "play"} size={11} fill="currentColor" stroke="none" className={speaking ? "text-danger" : "text-brand"} />
      {speaking ? "Stop" : label}
    </button>
  );
}
