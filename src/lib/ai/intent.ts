/**
 * Intent classification — pure, dependency-free, and safe to import anywhere
 * (client or server). Kept separate from reply.ts so the browser can use
 * detectIntent (and the scorecard/reactive layers) without pulling in the
 * Anthropic SDK that reply.ts needs server-side.
 */

export type Intent =
  | "hostile"
  | "spam"
  | "gatekeeper"
  | "busy"
  | "authority"
  | "budget"
  | "confused"
  | "decline"
  | "competitor"
  | "price"
  | "timing"
  | "trust"
  | "info"
  | "question"
  | "positive";

/** The five reframe-with-an-industry-angle objection types. */
export type ObjectionKind = "price" | "timing" | "competitor" | "trust" | "info";
/** Situational intents handled by universal (industry-agnostic) human responses. */
export type SituationalIntent = "authority" | "budget" | "busy" | "spam" | "confused" | "hostile" | "gatekeeper";

export const OBJECTION_KINDS = new Set<Intent>(["price", "timing", "competitor", "trust", "info"]);
export const SITUATIONAL_KINDS = new Set<Intent>(["authority", "budget", "busy", "spam", "confused", "hostile", "gatekeeper"]);

/**
 * Classify the prospect's incoming message so the reply addresses what they
 * actually said — across the full range a human throws at you on a call, not a
 * few buckets. Order matters: the most specific / most urgent signals win, and
 * anything unrecognized still lands on a sensible human default (question →
 * positive), so there's no input we can't respond to gracefully.
 */
export function detectIntent(incoming: string): Intent {
  const t = incoming.toLowerCase();
  if (/\b(stop calling|do ?n'?t call( me)?( again)?|leave me alone|this is harassment|how many times|cut it out|piss off|f off|get lost)\b/.test(t)) return "hostile";
  if (/\b(how did you get|who gave you|where did you get|is this a (robot|recording|robocall|telemarketer|sales call|cold call)|are you a (bot|robot|real person|human)|robocall|is this spam)\b/.test(t)) return "spam";
  if (/\b(can i (take|leave) a message|who('?s| is) calling|may i ask who|put (you|them) through|s?he'?s not (available|in|here)|s?he'?s in a meeting|s?he'?s out|they'?re not available|this is (his|her|their) (office|assistant))\b/.test(t)) return "gatekeeper";
  if (/\b(can'?t (talk|chat)|in a meeting|i'?m driving|driving right now|catch me later|call me (back|later)|bad time to talk|at work right now|on my way|in the middle of|gimme a sec)\b/.test(t)) return "busy";
  if (/\b(not my (call|decision)|talk to my (boss|manager|partner|wife|husband|spouse|team)|run it by|check with (my|the|him|her|them)|needs? approval|loop in|someone else (handles|decides)|not the (decision|one who decides)|above my pay)\b/.test(t)) return "authority";
  if (/\b(no budget|do ?n'?t have (the |a )?budget|can'?t afford|out of (our )?budget|budget('?s| is)? (tight|frozen|gone|cut|maxed)|no money|spent (our|the) budget|nothing left in the budget)\b/.test(t)) return "budget";
  if (/\b(who('?s| is) this|do i know you|what company|never heard of|what is this in regards)\b/.test(t)) return "confused";
  // "what's this (about)?" is confusion ONLY as a complete utterance — anchored
  // so "what's this going to cost?" keeps flowing to the price rule below
  // instead of getting "who are you?" handling on a live call.
  if (/\bwhat('?s| is) this( about| regarding)?\s*[?!.]*$/.test(t)) return "confused";
  if (/\b(not interested|no thanks|no thank you|unsubscribe|please remove|take me off|already (sold|closed)|not for us|we'?ll pass|gonna pass|hard pass)\b/.test(t)) return "decline";
  if (/\b(went with|going with|already (have|using|bought|got)|we use|we'?ve got|signed with|chose|have a (vendor|provider|solution|agent|lender|broker|guy))\b/.test(t)) return "competitor";
  if (/\b(how much|price|pricing|cost|costs|expensive|too much|discount|quote|ballpark|rates?)\b/.test(t)) return "price";
  if (/\b(not (right )?now|not the right time|next (quarter|month|year|week)|maybe later|circle back|reach back|check back|not a priority|after the holidays|q[1-4])\b/.test(t)) return "timing";
  if (/\b(does (it|this) (really|actually)|proof|case study|references?|guarantee|not sure (it|this) works|sounds too good|is this legit|scam|skeptical|trust)\b/.test(t)) return "trust";
  if (/\b(send (me|over|info|details|something|that)|email me|brochure|more (info|details|information)|one[- ]?pager|deck|literature)\b/.test(t)) return "info";
  if (incoming.includes("?") || /\b(what about|can you|do you|when|where|why|which|who)\b/.test(t)) return "question";
  return "positive";
}
