/**
 * Per-org read-aloud voice tuning (hosted ElevenLabs voice): speaking SPEED and
 * EXPRESSIVENESS. Pure (de)serialization + clamping so the values are always
 * in-range no matter what's stored — the storage/wiring is elsewhere.
 *
 *  - rate: playback/speaking speed. 1 = natural. Clamped to a sane sales-call
 *    range so a stored extreme can't make outreach unlistenable.
 *  - expressiveness: 0 = flat/measured, 1 = lively. Maps to ElevenLabs
 *    `stability` (inverted) in tts.ts — higher expressiveness → lower stability.
 */

export interface VoiceSettings {
  rate: number;
  expressiveness: number;
}

// Default leans lively (0.6) — a sales voice should sound human and engaged, not
// flat. Maps to a lower ElevenLabs `stability` for more natural intonation/tone.
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { rate: 1, expressiveness: 0.6 };

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

/** Coerce arbitrary stored JSON into safe, in-range voice settings. Pure + tested. */
export function mergeVoiceSettings(raw: unknown): VoiceSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    rate: clamp(o.rate, 0.7, 1.2, DEFAULT_VOICE_SETTINGS.rate),
    expressiveness: clamp(o.expressiveness, 0, 1, DEFAULT_VOICE_SETTINGS.expressiveness),
  };
}

/** ElevenLabs `stability` for a given expressiveness (inverted + bounded so it
 *  never hits the unstable/robotic extremes). Pure + tested. */
export function expressivenessToStability(expressiveness: number): number {
  const e = clamp(expressiveness, 0, 1, DEFAULT_VOICE_SETTINGS.expressiveness);
  // expressiveness 0 → stability 0.8 (measured), 1 → 0.3 (lively).
  return Math.round((0.8 - e * 0.5) * 100) / 100;
}
