import type { VoicePrefs } from "@/lib/voice/speech";

/**
 * On-device spoken-voice preferences. Stored in localStorage so a rep's chosen
 * voice, speed, and pitch follow them across the app with no backend and no data
 * leaving the device — the in-house voice, tuned to them. Pure (de)serialization
 * is tested; the storage access is SSR/availability guarded.
 */

const KEY = "rr.voicePrefs.v1";

export interface StoredVoicePrefs {
  voiceName?: string;
  rate: number;
  pitch: number;
}

export const DEFAULT_VOICE_PREFS: StoredVoicePrefs = { rate: 1, pitch: 1 };

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

/** Coerce arbitrary stored JSON into safe, in-range prefs. Pure + tested. */
export function normalizePrefs(raw: unknown): StoredVoicePrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    voiceName: typeof o.voiceName === "string" && o.voiceName ? o.voiceName : undefined,
    rate: clamp(o.rate, 0.6, 1.4, DEFAULT_VOICE_PREFS.rate),
    pitch: clamp(o.pitch, 0.6, 1.6, DEFAULT_VOICE_PREFS.pitch),
  };
}

export function loadVoicePrefs(): StoredVoicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_PREFS };
  try {
    return normalizePrefs(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function saveVoicePrefs(prefs: StoredVoicePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(normalizePrefs(prefs)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Map stored prefs into the shape speak()/pickVoice consume. */
export function toVoicePrefs(p: StoredVoicePrefs): VoicePrefs {
  return { preferName: p.voiceName, rate: p.rate, pitch: p.pitch, lang: "en-US" };
}
