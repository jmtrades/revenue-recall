import {
  type SpeakHandle,
  type VoicePrefs,
} from "@/lib/voice/speech";

/**
 * Provider-agnostic speech-synthesis seam. Voice is **ElevenLabs-only**: the
 * hosted ElevenLabs backend (registered via setSynth from neural.ts) is the sole
 * engine. There is deliberately NO browser-TTS / on-device fallback — when
 * ElevenLabs isn't configured, getSynth() returns a no-op synth and callers
 * degrade to silence (or an "unavailable" state) rather than a different,
 * lower-fidelity voice. Every caller (SpeakButton, RolePlay, VoiceControls) goes
 * through getSynth(), so this stays the single source of truth.
 */

export type SynthKind = "client" | "neural";

export interface SpeakOptions extends VoicePrefs {
  /** Voice identity: a preset name, or a cloned rep-voice id (ElevenLabs). */
  voiceId?: string;
}

export interface VoiceSynth {
  /** Stable id for logging/telemetry, e.g. "rr-hosted-tts". */
  id: string;
  kind: SynthKind;
  /** True when usable in the current environment (ElevenLabs key configured). */
  available(): boolean;
  /** Speak the text now; resolves when finished. stop() interrupts immediately. */
  speak(text: string, opts?: SpeakOptions): Promise<SpeakHandle>;
}

/**
 * No-op stand-in for the removed browser-TTS fallback. Voice is ElevenLabs-only,
 * so when no ElevenLabs backend is available there is nothing to speak with — this
 * resolves immediately and reports unavailable, keeping callers crash-free without
 * ever substituting a different voice. (Kept under the `browserSynth` name so the
 * existing importers keep compiling.)
 */
export const browserSynth: VoiceSynth = {
  id: "none",
  kind: "client",
  available: () => false,
  async speak() {
    return { done: Promise.resolve(), stop: () => {} };
  },
};

let registered: VoiceSynth | null = null;

/** Register the ElevenLabs backend so getSynth() uses it when configured. */
export function setSynth(synth: VoiceSynth | null): void {
  registered = synth;
}

/** Resolve the speech backend: the registered ElevenLabs synth when usable, else
 *  the no-op (there is no browser fallback — voice is ElevenLabs-only). */
export function getSynth(): VoiceSynth {
  if (registered && registered.available()) return registered;
  return browserSynth;
}
