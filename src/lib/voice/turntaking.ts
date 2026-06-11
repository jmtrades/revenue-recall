import type { Sentiment } from "@/lib/voice/reactive";
import { detectIntent, OBJECTION_KINDS } from "@/lib/ai/intent";
import type { Emotion } from "@/lib/voice/speech";

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

// ---- instant acknowledgments (the dead-air killer) ----
// A human responds within ~200ms of you finishing — not with the answer, but
// with a small "I heard you" that buys the thinking time: "Yeah, fair—".
// These are spoken IMMEDIATELY while the real reply generates, so the
// conversation never has the 1–3s of dead silence that screams "bot".
// Intent-aware so the ack itself already lands right: an objection gets
// empathy, good news gets energy, a brush-off gets grace.

interface Ack {
  text: string;
  emotion: Emotion;
}

const REP_ACKS: Record<string, Ack[]> = {
  price: [
    { text: "Yeah — fair question.", emotion: "warm" },
    { text: "Totally fair to ask.", emotion: "warm" },
    { text: "Mm, good question.", emotion: "neutral" },
  ],
  timing: [
    { text: "No, that makes sense.", emotion: "empathetic" },
    { text: "Yeah, I hear you.", emotion: "empathetic" },
    { text: "Totally understand.", emotion: "calm" },
  ],
  competitor: [
    { text: "Okay — that's good to know.", emotion: "neutral" },
    { text: "Right, makes sense.", emotion: "calm" },
  ],
  trust: [
    { text: "Yeah — fair to be skeptical.", emotion: "empathetic" },
    { text: "No, I get that.", emotion: "calm" },
  ],
  decline: [
    { text: "Totally hear you.", emotion: "empathetic" },
    { text: "No worries at all.", emotion: "calm" },
  ],
  positive: [
    { text: "Love that.", emotion: "energetic" },
    { text: "Great —", emotion: "energetic" },
    { text: "Perfect.", emotion: "confident" },
  ],
  busy: [
    { text: "Of course —", emotion: "calm" },
    { text: "Sure, quickly then —", emotion: "confident" },
  ],
  hostile: [
    { text: "Okay — fair enough.", emotion: "empathetic" },
  ],
  default: [
    { text: "Mm-hm.", emotion: "neutral" },
    { text: "Right.", emotion: "neutral" },
    { text: "Yeah —", emotion: "warm" },
    { text: "Got it.", emotion: "neutral" },
  ],
};

// The simulated prospect just needs small human fillers while "thinking".
const PROSPECT_ACKS: Ack[] = [
  { text: "Hm.", emotion: "neutral" },
  { text: "Right…", emotion: "neutral" },
  { text: "Okay —", emotion: "neutral" },
  { text: "Mm.", emotion: "calm" },
];

function fnv(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** The instant "I heard you" to speak while the real reply generates.
 *  Deterministic on the seed so tests (and retries) are stable. */
export function pickAck(incoming: string, seed: string, speaker: "rep" | "prospect" = "rep"): Ack {
  if (speaker === "prospect") return PROSPECT_ACKS[fnv(`${seed}:p`) % PROSPECT_ACKS.length];
  const intent = detectIntent(incoming);
  const pool = REP_ACKS[intent] ?? (OBJECTION_KINDS.has(intent) ? REP_ACKS.trust : REP_ACKS.default);
  return pool[fnv(`${seed}:${intent}`) % pool.length];
}
