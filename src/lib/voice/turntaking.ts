import type { Sentiment } from "@/lib/voice/reactive";

/**
 * Turn-taking timing — the small human reflexes that make a spoken call feel
 * real instead of walkie-talkie: a beat of "thinking" before answering, a pause
 * to be sure they've finished, barge-in (stop talking the instant they speak),
 * and the occasional backchannel ("mm-hm") so they know you're listening. Pure
 * and tested; the browser wiring in speech.ts/RolePlay calls these.
 */

/** Silence after the other person stops before we treat their turn as finished. */
export const END_OF_TURN_SILENCE_MS = 700;

/** A natural "let me think" beat before responding, varied by how loaded the moment is. */
export function thinkingPauseMs(sentiment: Sentiment): number {
  switch (sentiment) {
    case "frustrated":
      return 900; // give them room, don't pounce
    case "negative":
      return 750;
    case "excited":
      return 350; // match their pace
    case "positive":
      return 450;
    default:
      return 600;
  }
}

/**
 * Should the speaker stop mid-sentence because the other person started talking?
 * Yes — humans yield the floor immediately when interrupted. We require a couple
 * of words so a stray cough/"mm" doesn't cut off a real sentence.
 */
export function shouldBargeIn(isSpeaking: boolean, heardWords: number): boolean {
  return isSpeaking && heardWords >= 2;
}

const BACKCHANNELS = ["mm-hm", "right", "got it", "yeah", "sure", "totally", "okay"];

/** Occasional listening noise while the other person talks. Returns null most of
 *  the time so it stays natural, not parrot-like. Deterministic on the seed. */
export function pickBackchannel(seed: string, turnIndex: number): string | null {
  // Roughly every third longish turn, and never on the very first.
  if (turnIndex < 1 || turnIndex % 3 !== 0) return null;
  let h = 2166136261;
  const s = `${seed}:${turnIndex}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return BACKCHANNELS[Math.abs(h) % BACKCHANNELS.length];
}

/** Count words in a (possibly interim) transcript. */
export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
