import {
  isSpeechSupported,
  loadVoices,
  pickVoice,
  speak,
  type SpeakHandle,
  type VoicePrefs,
} from "@/lib/voice/speech";

/**
 * Provider-agnostic speech-synthesis seam. Today the only backend is the
 * browser's built-in engine (in-house, dependency-free). When our own neural
 * voice ships it implements this same interface and registers via setSynth() —
 * every caller (SpeakButton, RolePlay, VoiceControls) keeps working unchanged.
 *
 * See docs/neural-voice.md for the neural backend build plan; this is the exact
 * contract it must satisfy.
 */

export type SynthKind = "client" | "neural";

export interface SpeakOptions extends VoicePrefs {
  /** Voice identity: a preset name, or a cloned rep-voice id (neural backend). */
  voiceId?: string;
}

export interface VoiceSynth {
  /** Stable id for logging/telemetry, e.g. "browser" or "rr-neural-v1". */
  id: string;
  kind: SynthKind;
  /** True when usable in the current environment (browser support, keys, etc.). */
  available(): boolean;
  /** Speak the text now; resolves when finished. stop() interrupts immediately. */
  speak(text: string, opts?: SpeakOptions): Promise<SpeakHandle>;
}

/** The built-in browser engine, wrapped to satisfy the VoiceSynth contract. */
export const browserSynth: VoiceSynth = {
  id: "browser",
  kind: "client",
  available: () => isSpeechSupported(),
  async speak(text, opts = {}) {
    const voices = await loadVoices();
    const voice = pickVoice(voices, { preferName: opts.voiceId ?? opts.preferName, lang: opts.lang, rate: opts.rate, pitch: opts.pitch });
    return speak(text, opts, voice);
  },
};

let registered: VoiceSynth | null = null;

/** Register a higher-fidelity backend (e.g. the neural voice) once it exists. */
export function setSynth(synth: VoiceSynth | null): void {
  registered = synth;
}

/** Resolve the best available synth: a registered backend if usable, else browser. */
export function getSynth(): VoiceSynth {
  if (registered && registered.available()) return registered;
  return browserSynth;
}
