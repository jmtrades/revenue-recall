/**
 * Curated in-house "house voices" — Kokoro (ONNX) voice ids the call-gateway
 * speaks in. Self-hosted: the weights run on your own infra, no vendor in the
 * call path. A `clone:<id>` voice (a consented, watermarked signature voice)
 * also works anywhere a house voice id does. Shared by the settings picker and
 * the per-org call-voice validation.
 */

export interface HouseVoice {
  id: string;
  /** Display name. */
  label: string;
  /** Short descriptor (gender / tone / accent). */
  description: string;
}

export const HOUSE_VOICES: HouseVoice[] = [
  { id: "af_heart", label: "Aria", description: "Warm female · US" },
  { id: "af_bella", label: "Bella", description: "Bright female · US" },
  { id: "af_nicole", label: "Nicole", description: "Soft female · US" },
  { id: "af_nova", label: "Nova", description: "Confident female · US" },
  { id: "am_adam", label: "Adam", description: "Steady male · US" },
  { id: "am_michael", label: "Michael", description: "Friendly male · US" },
  { id: "am_onyx", label: "Onyx", description: "Deep male · US" },
  { id: "bf_emma", label: "Emma", description: "Female · UK" },
  { id: "bm_george", label: "George", description: "Male · UK" },
];

/** The default house voice (matches the gateway's Kokoro default). */
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
