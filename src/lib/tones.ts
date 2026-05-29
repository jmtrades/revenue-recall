/**
 * Tone presets — the selectable "voices" a rep can write in. These layer ON TOP
 * of the personal voice profile (which captures *who* is writing); the tone
 * shapes *how* this particular message lands. Pure data so the picker (client)
 * and the drafting layer (server) share one source.
 *
 * On the live-AI path each tone injects a strong directive into the prompt. On
 * the no-key fallback the tone is folded into the deterministic seed, so picking
 * a different tone reshuffles the composition into a different (always clean)
 * human message — tone visibly changes output in the demo too.
 */

export type ToneId =
  | "warm"
  | "direct"
  | "consultative"
  | "friendly"
  | "reassuring"
  | "confident"
  | "enthusiastic";

export interface Tone {
  id: ToneId;
  label: string;
  /** One-liner for the picker. */
  description: string;
  /** Injected into the AI prompt to steer how the message reads. */
  directive: string;
}

export const TONES: Tone[] = [
  {
    id: "warm",
    label: "Warm & personable",
    description: "Friendly and human, like a trusted contact checking in.",
    directive:
      "Warm and personable. Write like a trusted human who genuinely likes this person — easy, a little informal, never gushy. Lead with care, not a pitch.",
  },
  {
    id: "direct",
    label: "Direct & concise",
    description: "Short, respectful of their time, straight to the ask.",
    directive:
      "Direct and concise. Respect their time: two or three short sentences, one clear ask, zero filler. Confident, never blunt or cold.",
  },
  {
    id: "consultative",
    label: "Consultative expert",
    description: "Advisor tone — insight first, then a low-key next step.",
    directive:
      "Consultative. Sound like a sharp advisor who knows this space: lead with one genuine insight or observation, then a low-key next step. Earn the reply, don't ask for it.",
  },
  {
    id: "friendly",
    label: "Casual & friendly",
    description: "Relaxed, texting-a-colleague energy. Great for SMS.",
    directive:
      "Casual and friendly, like texting a colleague you get on with. Lowercase-casual is fine, contractions throughout, light and easy — but still say something worth replying to.",
  },
  {
    id: "reassuring",
    label: "Calm & reassuring",
    description: "Low-pressure and steady — ideal for nervous or stalled deals.",
    directive:
      "Calm and reassuring. Take the pressure off completely: steady, patient, no urgency games. Make it genuinely easy to say 'not yet' and feel fine about it.",
  },
  {
    id: "confident",
    label: "Confident & assertive",
    description: "Assured and decisive, assumes the next step.",
    directive:
      "Confident and assertive. Assume the next step is worth taking and propose a specific one — a real date or time. Self-assured, never arrogant or pushy.",
  },
  {
    id: "enthusiastic",
    label: "Upbeat & energetic",
    description: "Positive and momentum-building, without the hype.",
    directive:
      "Upbeat and energetic. Bring real, grounded momentum — genuine optimism, not hype. At most one exclamation mark, and only if it's earned. Never salesy.",
  },
];

export const DEFAULT_TONE: ToneId = "warm";

export function isToneId(v: unknown): v is ToneId {
  return typeof v === "string" && TONES.some((t) => t.id === v);
}

export function getTone(id?: string): Tone {
  return TONES.find((t) => t.id === id) ?? TONES[0];
}
