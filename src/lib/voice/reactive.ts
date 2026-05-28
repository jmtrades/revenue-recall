import type { Emotion } from "@/lib/voice/speech";
import type { ToneId } from "@/lib/tones";
import { detectIntent, type Intent } from "@/lib/ai/reply";

/**
 * Reactive delivery policy — the "read the room and adjust" reflex. From what the
 * other person just said, infer their mood and choose how the rep should respond:
 * which tone to write in AND how to deliver it (emotional prosody). This is what
 * makes the voice feel human: it doesn't say everything the same way — it warms
 * up, slows down, or matches energy based on the moment. Pure and tested.
 */

export type Sentiment = "frustrated" | "negative" | "neutral" | "positive" | "excited";

const FRUSTRATED = /\b(stop calling|leave me alone|annoyed|annoying|frustrat|waste of (my )?time|ridiculous|seriously\?|not again|tired of|how many times|unbelievable|cut the)\b/i;
const EXCITED = /\b(love (it|this)|awesome|amazing|perfect|incredible|can't wait|let's do it|let's go|absolutely|sounds great|so good|exactly what)\b/i;
const NEGATIVE = /\b(not interested|no thanks|too expensive|can't afford|don't (want|need)|already have|went with|not (right )?now|pass|unsubscribe|stop)\b/i;
const POSITIVE = /\b(sounds good|that works|makes sense|interested|sure|okay|ok\b|yeah|tell me more|go on|thanks|appreciate)\b/i;

/** Infer emotional state from a line. Order matters: strongest signal wins. */
export function detectSentiment(text: string): Sentiment {
  const t = text.toLowerCase();
  if (FRUSTRATED.test(t)) return "frustrated";
  if (EXCITED.test(t)) return "excited";
  if (NEGATIVE.test(t)) return "negative";
  if (POSITIVE.test(t)) return "positive";
  return "neutral";
}

/** How the speaker themselves likely sounds — used to voice a simulated prospect. */
export function sentimentToEmotion(s: Sentiment): Emotion {
  switch (s) {
    case "excited":
      return "energetic";
    case "positive":
      return "warm";
    case "frustrated":
      return "confident"; // clipped, terse
    case "negative":
      return "calm"; // flat, disengaging
    default:
      return "neutral";
  }
}

export interface Reaction {
  /** Tone to write the reply in. */
  tone: ToneId;
  /** How to deliver it out loud. */
  emotion: Emotion;
  /** One-line coaching cue for the rep. */
  note: string;
}

/** Choose tone + delivery from the prospect's intent and mood. */
export function reactTo(intent: Intent, sentiment: Sentiment): Reaction {
  // Mood overrides the playbook: a frustrated or thrilled person needs a human
  // reaction first, whatever the topic.
  if (sentiment === "frustrated")
    return { tone: "reassuring", emotion: "empathetic", note: "They're frustrated — slow down, acknowledge it, take all the pressure off." };
  if (sentiment === "excited")
    return { tone: "enthusiastic", emotion: "energetic", note: "Match their energy and move to a concrete next step now." };

  switch (intent) {
    case "decline":
      return { tone: "reassuring", emotion: "calm", note: "They're out — be gracious, leave the door open, don't push." };
    case "price":
      return { tone: "consultative", emotion: "confident", note: "Don't flinch — anchor to value, then ask about their budget." };
    case "timing":
      return { tone: "reassuring", emotion: "calm", note: "Take the pressure off and soft-date a check-back." };
    case "competitor":
      return { tone: "consultative", emotion: "warm", note: "Stay gracious, no trash-talk — get curious about the gap." };
    case "trust":
      return { tone: "consultative", emotion: "confident", note: "Calmly offer proof, not promises." };
    case "info":
      return { tone: "consultative", emotion: "warm", note: "Ask one question before sending, so it's the right thing." };
    case "question":
      return { tone: "consultative", emotion: "warm", note: "Answer straight, then keep it moving." };
    case "positive":
      return { tone: "confident", emotion: "warm", note: "Build on it — propose a specific next step." };
    default:
      return { tone: "warm", emotion: "warm", note: "Stay warm and curious." };
  }
}

/** Convenience: react directly to a raw incoming line. */
export function reactToText(text: string): Reaction {
  return reactTo(detectIntent(text), detectSentiment(text));
}
