/**
 * Curated "house voices" — stable ids that map 1:1 to distinct ElevenLabs voices
 * (see ELEVEN_VOICES in tts.ts). The app and the call-gateway both speak them via
 * ElevenLabs. A `clone:<id>` voice (a consented, watermarked signature voice) also
 * works anywhere a house voice id does. Shared by the settings picker and the
 * per-org call-voice validation.
 */

export interface HouseVoice {
  id: string;
  /** Display name. */
  label: string;
  /** Short descriptor (gender / tone / accent). */
  description: string;
}

// Curated best-of-the-best. Every entry is a DISTINCT, top-tier ElevenLabs voice
// (1:1 mapping in tts.ts ELEVEN_VOICES — no two share a sound) and the label is
// that voice's REAL name, so what you pick is exactly what you hear. The call
// gateway maps each id to its matching ElevenLabs voice (services/call-gateway/voices.py).
export const HOUSE_VOICES: HouseVoice[] = [
  // US female
  { id: "af_heart", label: "Aria", description: "Warm, expressive · US" },
  { id: "af_sarah", label: "Sarah", description: "Soft, professional · US" },
  { id: "af_nicole", label: "Laura", description: "Bright, youthful · US" },
  { id: "af_nova", label: "Charlotte", description: "Confident, smooth · US" },
  { id: "af_jessica", label: "Jessica", description: "Expressive, lively · US" },
  { id: "af_river", label: "River", description: "Calm, even · US" },
  { id: "af_sky", label: "Matilda", description: "Friendly, warm · US" },
  // US male
  { id: "am_adam", label: "Brian", description: "Deep, natural · US" },
  { id: "am_michael", label: "Roger", description: "Easy-going · US" },
  { id: "am_onyx", label: "Bill", description: "Older, trustworthy · US" },
  { id: "am_eric", label: "Eric", description: "Smooth, crisp · US" },
  { id: "am_liam", label: "Liam", description: "Articulate, young · US" },
  { id: "am_echo", label: "Will", description: "Relaxed, friendly · US" },
  { id: "am_fenrir", label: "Chris", description: "Casual, natural · US" },
  { id: "am_puck", label: "Callum", description: "Rich, characterful · transatlantic" },
  // UK female
  { id: "bf_emma", label: "Alice", description: "Clear, warm · UK" },
  { id: "bf_lily", label: "Lily", description: "Soft, gentle · UK" },
  // UK male
  { id: "bm_george", label: "George", description: "Warm, mature · UK" },
  { id: "bm_daniel", label: "Daniel", description: "Authoritative · UK" },
];

/** The default house voice (Aria — maps to the gateway's default ElevenLabs voice). */
export const DEFAULT_HOUSE_VOICE = "af_heart";

/** A selectable call voice id: a known house voice, or a `clone:<id>` signature
 *  voice (validated loosely — the gateway enforces consent before cloning). */
export function isCallVoiceId(id: string): boolean {
  if (typeof id !== "string" || id.length === 0 || id.length > 80) return false;
  if (id.startsWith("clone:")) return /^clone:[A-Za-z0-9_-]{1,64}$/.test(id);
  return HOUSE_VOICES.some((v) => v.id === id);
}

export function houseVoiceLabel(id: string | undefined | null): string {
  if (!id) return "Aria (default)";
  if (id.startsWith("clone:")) return `Cloned voice (${id.slice("clone:".length)})`;
  return HOUSE_VOICES.find((v) => v.id === id)?.label ?? id;
}
