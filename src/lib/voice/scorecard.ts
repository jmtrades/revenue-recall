import { detectIntent, type Intent } from "@/lib/ai/intent";
import { detectSentiment, type Sentiment } from "@/lib/voice/reactive";
import type { Turn } from "@/lib/voice/conversation";

/**
 * Post-call scorecard — grades how a call (real or role-play) was handled, the
 * way a sales coach or QA team would. Pure and deterministic so it runs instantly
 * with no API and is fully testable; the qualitative AI coach can layer on top.
 *
 * This is what makes the system enterprise-grade (coaching + QA at scale) and
 * what a solo rep needs to get better every call.
 */

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface HandledObjection {
  intent: Intent;
  prospectSaid: string;
  handled: boolean;
}

export interface CallScore {
  grade: Grade;
  score: number; // 0–100
  /** Rep's share of the words spoken (0–1). ~0.4–0.55 is the sweet spot. */
  talkRatio: number;
  repWords: number;
  prospectWords: number;
  /** Rep turns that asked a question — discovery signal. */
  questionsAsked: number;
  /** Longest uninterrupted rep stretch, in words (monologue detector). */
  longestMonologue: number;
  objections: HandledObjection[];
  sentimentArc: "warmed" | "cooled" | "steady";
  nextStepSecured: boolean;
  /** Concrete, prioritized coaching tips. */
  tips: string[];
}

const OBJECTIONS = new Set<Intent>(["price", "timing", "competitor", "trust", "info", "authority", "budget", "busy", "spam", "confused"]);
const NEXT_STEP =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|this week|\d{1,2}\s?(am|pm)|\d{1,2}:\d{2}|o'clock|calendar|invite|book(ed|ing)?|schedule|set (up )?a (call|time|meeting|demo)|talk (then|thursday)|see you)\b/i;

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

const sentScore: Record<Sentiment, number> = { frustrated: -2, negative: -1, neutral: 0, positive: 1, excited: 2 };

/** Grade a call transcript. */
export function analyzeCall(turns: Turn[]): CallScore {
  const rep = turns.filter((t) => t.speaker === "rep");
  const prospect = turns.filter((t) => t.speaker === "prospect");
  const repWords = rep.reduce((n, t) => n + words(t.text), 0);
  const prospectWords = prospect.reduce((n, t) => n + words(t.text), 0);
  const total = repWords + prospectWords;
  const talkRatio = total ? repWords / total : 0;
  const questionsAsked = rep.filter((t) => t.text.includes("?")).length;
  const longestMonologue = rep.reduce((m, t) => Math.max(m, words(t.text)), 0);

  // Objections raised by the prospect, and whether the rep's next turn engaged.
  const objections: HandledObjection[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.speaker !== "prospect") continue;
    const intent = detectIntent(t.text);
    if (!OBJECTIONS.has(intent)) continue;
    const next = turns[i + 1];
    const handled = Boolean(next && next.speaker === "rep" && (next.text.includes("?") || words(next.text) >= 4));
    objections.push({ intent, prospectSaid: t.text, handled });
  }

  const firstMood = prospect.length ? detectSentiment(prospect[0].text) : "neutral";
  const lastMood = prospect.length ? detectSentiment(prospect[prospect.length - 1].text) : "neutral";
  const arc = sentScore[lastMood] - sentScore[firstMood];
  const sentimentArc = arc > 0 ? "warmed" : arc < 0 ? "cooled" : "steady";

  const nextStepSecured = rep.some((t) => NEXT_STEP.test(t.text));

  // Score + tips.
  let score = 100;
  const tips: string[] = [];

  if (talkRatio > 0.7) {
    score -= 15;
    tips.push("You talked most of the time — aim to listen more than you speak. Ask, then go quiet.");
  } else if (total > 0 && talkRatio < 0.25 && rep.length >= 2) {
    score -= 8;
    tips.push("You went quiet — lead the call a bit more and steer toward a next step.");
  }

  if (rep.length >= 2 && questionsAsked / rep.length < 0.4) {
    score -= 12;
    tips.push("Not enough questions — discovery is where deals move. End more turns with a real question.");
  }

  if (longestMonologue > 60) {
    score -= 10;
    tips.push("One of your turns ran long. Break it up — a couple of sentences, then hand it back.");
  }

  const unhandled = objections.filter((o) => !o.handled);
  if (unhandled.length) {
    score -= Math.min(30, unhandled.length * 10);
    tips.push(`Address every objection — ${unhandled.length} went unanswered (${unhandled.map((o) => o.intent).join(", ")}).`);
  }

  if (sentimentArc === "cooled") {
    score -= 10;
    tips.push("They cooled over the call. Slow down, acknowledge their concern, and ease the pressure.");
  } else if (sentimentArc === "warmed") {
    score = Math.min(100, score + 5);
  }

  if (!nextStepSecured && rep.length >= 3) {
    score -= 15;
    tips.push("No concrete next step. Always close on a specific day and time, not a vague 'I'll follow up'.");
  }

  score = Math.max(0, Math.min(100, score));
  if (!tips.length) tips.push("Strong call — balanced, curious, and you locked a next step. Keep doing this.");

  const grade: Grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : "F";

  return { grade, score, talkRatio, repWords, prospectWords, questionsAsked, longestMonologue, objections, sentimentArc, nextStepSecured, tips };
}
