import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { getPlaybook } from "@/lib/industries";
import { languageDirective } from "@/lib/languages";
import { getTone, type ToneId } from "@/lib/tones";
import { detectIntent, type Intent } from "@/lib/ai/intent";
import { analyzeProgress, decideDirective, type CallDirective } from "@/lib/voice/objection";
import { reactTo, reactToText, detectSentiment, sentimentToEmotion, type Sentiment } from "@/lib/voice/reactive";
import { analyzeCall, type CallScore } from "@/lib/voice/scorecard";
import type { Emotion } from "@/lib/voice/speech";
import { firstName, pick, pickVariant, seeded, sentence } from "@/lib/copy";

/**
 * Conversation engine — the brain of a spoken (or simulated) sales call. It's
 * transport-agnostic on purpose: it decides WHAT the rep says next given the
 * call so far, and a separate audio layer (TTS/telephony, ours or a vendor's)
 * can speak it. That keeps the valuable, ownable part — the talk track, the
 * objection handling, the timing of the close — here, fully testable, and
 * independent of any voice provider.
 *
 * It also simulates a realistic prospect, so the dialer can run live role-play:
 * the app plays a tough buyer and the rep practises against it.
 */

export type Speaker = "rep" | "prospect";
export interface Turn {
  speaker: Speaker;
  text: string;
}

export type CallPhase = "opening" | "discovery" | "handling" | "closing" | "wrap";

export interface ConversationState {
  contactName: string;
  company?: string;
  dealTitle: string;
  industryId?: string;
  industryLabel?: string;
  tone?: ToneId;
  /** ISO 639-1 language the call is conducted in (default English). */
  language?: string;
  voice?: { senderName?: string; profile?: string; customNextSteps?: string[] };
  /** Full transcript so far, oldest first. */
  turns: Turn[];
}

export interface RepTurn {
  /** What the rep says next — short, spoken, no sign-off. */
  text: string;
  phase: CallPhase;
  /** True when the call should naturally end after this line. */
  done: boolean;
  /** Tone chosen in reaction to the prospect's mood. */
  tone: ToneId;
  /** How to deliver it out loud. */
  emotion: Emotion;
  /** One-line coaching cue. */
  coachNote: string;
  source: "ai" | "template";
}

export type Difficulty = "easy" | "medium" | "hard";
export interface ProspectTurn {
  text: string;
  /** What the prospect is doing — useful for coaching. */
  intent: Intent;
  /** Their inferred mood. */
  sentiment: Sentiment;
  /** How they sound saying it (drives spoken delivery). */
  emotion: Emotion;
  source: "ai" | "template";
}

const REP_SYSTEM = `You are a top sales rep on a live phone call — a real human voice, never an AI. Output ONLY the next thing the rep says out loud: one or two short, spoken sentences. No stage directions, no sign-off, no email formatting.
- Sound natural and conversational, like talking, not writing. Contractions, easy rhythm.
- Keep them on the phone: most of your turns should end in a genuine, open question about them.
- Handle objections like a pro: acknowledge it as fair first, never argue, then ask a question that moves forward. Anchor price to value, soft-date timing, stay gracious about competitors, offer proof to skeptics.
- When there's real interest and you've earned it, ask for one concrete next step with a specific day/time.
- If they firmly decline, be gracious, thank them, and close warmly — don't push.
Return only the requested JSON.`;

const PROSPECT_SYSTEM = `You role-play a realistic, busy sales PROSPECT on a phone call so a rep can practise. Output ONLY what the prospect says out loud — one or two short, spoken sentences, natural and a little distracted.
- Be a real person, not a pushover and not a cartoon. Raise believable objections (price, timing, already have someone, skepticism, "just send info") at a realistic difficulty.
- React to what the rep actually said. If they handle you well, warm up gradually; if they're pushy or vague, get shorter and cooler.
- Don't volunteer to buy easily. Make them earn the next step.
Return only the requested JSON.`;

const REP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { text: { type: "string" } },
  required: ["text"],
};
const PROSPECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { text: { type: "string" } },
  required: ["text"],
};

function transcript(turns: Turn[], you: Speaker): string {
  if (!turns.length) return "(call just connected — nothing said yet)";
  return turns.map((t) => `${t.speaker === you ? "You" : "Them"}: ${t.text}`).join("\n");
}

function lastProspect(turns: Turn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].speaker === "prospect") return turns[i].text;
  return null;
}

const prospectTexts = (turns: Turn[]): string[] => turns.filter((t) => t.speaker === "prospect").map((t) => t.text);
const repCountOf = (turns: Turn[]): number => turns.filter((t) => t.speaker === "rep").length;

/** Map a policy directive to the call phase + whether the call ends after this line. */
function phaseAndDone(directive: CallDirective, repCount: number): { phase: CallPhase; done: boolean } {
  if (repCount === 0) return { phase: "opening", done: false };
  switch (directive.action) {
    case "exit":
      return { phase: "wrap", done: true };
    case "book_callback":
    case "close":
      return { phase: "closing", done: true };
    default:
      return { phase: "handling", done: false };
  }
}

/** Prompt guidance the directive adds, so the model phrases the RIGHT move. The
 *  policy (not the model) decides when to stop — this just shapes the wording. */
function directiveGuidance(directive: CallDirective): string {
  switch (directive.action) {
    case "exit":
      return directive.reason === "hostile"
        ? "They're done and irritated. Apologize once, briefly, and let them go — no pitch, no question."
        : "They've firmly passed. Thank them warmly, leave the door open in one line, and close — no question, no pitch.";
    case "book_callback":
      return "You've already addressed this and they're not moving today — do NOT re-explain or pitch again. Acknowledge it, then propose ONE specific callback (a day/time) or offer to send a single proof, and wrap warmly. This is your final line.";
    case "close":
      return "There's real interest. Ask for ONE concrete next step with a specific day and time.";
    default:
      return "Acknowledge their point as fair — don't argue — then ask one genuine question that moves things forward.";
  }
}

// ---- deterministic rep turns (no-key path, and the fallback when AI errors) ----
const OPENERS: ((f: string, co: string) => string)[] = [
  (f) => `Hey ${f}, it's me — caught you at an okay time? I'll be quick, promise.`,
  (f, co) => `Hi ${f} — thanks for picking up. Wanted to catch you about ${co} for two minutes, that work?`,
  (f) => `Hey ${f}, good to catch you. Quick one — how's everything going on your end?`,
];

// Spoken handling for the common intents; anything else falls back to "question"
// handling while the reactive policy still adapts tone/emotion.
const SPOKEN: Partial<Record<Intent, (f: string) => string[]>> = {
  decline: (f) => [
    `Totally fair, ${f} — I appreciate you being straight with me. I'll let you go, but I'm around if anything ever changes.`,
    `No worries at all, thanks for the honesty. I won't take more of your time — take care, ${f}.`,
  ],
  competitor: (f) => [
    `Makes sense you've got someone, ${f}. Out of curiosity, what's working well with them so far?`,
    `Good you're covered. Honestly — is there anything they're not quite nailing for you right now?`,
  ],
  price: (f) => [
    `Fair to ask, ${f} — it really scales to what you need. What kind of budget are you working with?`,
    `Yeah, I get it. Quick question so I'm not guessing — what range were you hoping to stay in?`,
  ],
  timing: (f) => [
    `Totally fair, no rush at all. When's realistically a better time for you — few weeks out?`,
    `Makes sense, ${f}. Want me to check back early next month when things calm down?`,
  ],
  trust: (f) => [
    `Fair to be skeptical — I would be too. What would you need to see to believe it actually works?`,
    `Good instinct, ${f}. I'd rather show you than tell you — can I send one real example after this?`,
  ],
  info: (f) => [
    `Happy to send something over — quick question first so it's actually useful: what matters most to you here?`,
    `Can do, ${f}. What's the main thing you'd want it to solve? I'll send exactly that.`,
  ],
  question: (f) => [
    `Good question — short version, here's the honest take. Does that line up with what you're after?`,
    `Yeah, fair — let me give you the straight answer rather than a maybe. What's driving the question?`,
  ],
  positive: (f) => [
    `Love it, ${f}. Want to grab fifteen minutes Thursday to walk through it properly?`,
    `Great — how about I lock a quick time so we keep the momentum? Does Wednesday work?`,
  ],
};

const CLOSERS: ((f: string) => string)[] = [
  (f) => `Perfect, ${f} — I'll send a calendar invite for then. Anything you want me to have ready?`,
  (f) => `Done. I'll get that on the calendar — looking forward to it, ${f}.`,
];

// When an objection keeps coming back (or the call is dragging), we stop
// re-pitching, secure ONE specific next touch, and bow out gracefully.
const BOOK_CALLBACK: ((f: string) => string)[] = [
  (f) => `I hear you, ${f} — I won't keep hammering it. How about I give you a quick ring next Tuesday once you've had a minute to sit with it?`,
  (f) => `Totally fair, and I don't want to talk your ear off. Let me send over one real example and grab you Thursday — that work?`,
  (f) => `No worries, ${f} — sounds like now's not the moment. I'll text you the details and try you again early next week, sound alright?`,
];

function fallbackRepTurn(state: ConversationState): RepTurn {
  const first = firstName(state.contactName);
  const co = state.company ?? "things";
  const seed = `${state.dealTitle}|${state.turns.length}|${state.tone ?? "warm"}`;
  const incoming = lastProspect(state.turns);
  const intent = incoming ? detectIntent(incoming) : null;
  const repCount = repCountOf(state.turns);
  const directive = decideDirective(analyzeProgress(prospectTexts(state.turns)), repCount);
  const { phase, done } = phaseAndDone(directive, repCount);
  // React to the prospect's mood; an explicit rep tone still wins if set.
  const reaction = incoming ? reactToText(incoming) : { tone: "warm" as ToneId, emotion: "warm" as Emotion, note: "Open warm and curious." };
  const tone = state.tone ?? reaction.tone;
  const base = { phase, tone, emotion: reaction.emotion, coachNote: reaction.note, source: "template" as const };

  if (phase === "opening") {
    return { ...base, text: pick(OPENERS, seed, "open")(first, co), emotion: "warm", done: false };
  }
  if (directive.action === "exit") {
    return { ...base, text: pick(SPOKEN.decline!(first), seed, "decline"), done: true };
  }
  if (directive.action === "book_callback") {
    return { ...base, text: pick(BOOK_CALLBACK, seed, "callback")(first), coachNote: "Objection kept coming back — stopped re-pitching, booked a callback, and wrapped.", done: true };
  }
  if (directive.action === "close") {
    return { ...base, text: pick(CLOSERS, seed, "close")(first), emotion: "energetic", done: true };
  }
  const pool = (intent && SPOKEN[intent]) || SPOKEN.question!;
  return { ...base, text: pick(pool(first), seed, intent ?? "discovery"), done };
}

/** Decide the rep's next spoken line given the call so far. */
export async function nextRepTurn(state: ConversationState): Promise<RepTurn> {
  if (!isAiConfigured()) return fallbackRepTurn(state);
  const pb = getPlaybook(state.industryId ?? "generic");
  const incoming = lastProspect(state.turns);
  const repCount = repCountOf(state.turns);
  // The deterministic policy decides the MOVE (handle / close / book a callback /
  // exit) and whether the call ends — so it can never loop forever re-pitching.
  const directive = decideDirective(analyzeProgress(prospectTexts(state.turns)), repCount);
  const { phase, done } = phaseAndDone(directive, repCount);
  const reaction = incoming ? reactToText(incoming) : { tone: "warm" as ToneId, emotion: "warm" as Emotion, note: "Open warm and curious." };
  // Adapt tone to the moment unless the rep pinned one.
  const tone = getTone(state.tone ?? reaction.tone);
  const user = `You're on a live call.
Read the room: the prospect sounds ${incoming ? detectSentiment(incoming) : "neutral"}. ${reaction.note}
Tone: ${tone.label} — ${tone.directive}
Industry: ${state.industryLabel ?? "sales"}
Prospect: ${state.contactName}${state.company ? ` at ${state.company}` : ""}
About: "${state.dealTitle}"
Their likely natural next-steps: ${pb.nextSteps.call.join(" / ")}
Phase: ${phase}
What to do now: ${directiveGuidance(directive)}
${state.voice?.profile ? `Speak in this rep's voice:\n"""${state.voice.profile}"""\n` : ""}${languageDirective(state.language) ? `${languageDirective(state.language)}\n` : ""}TRANSCRIPT SO FAR:
${transcript(state.turns, "rep")}

Say only the next line out loud, as the rep.`;
  try {
    // Live call: keep this fast — no thinking/effort, or the latency creates dead air mid-conversation.
    const out = await completeJson<{ text: string }>({ system: REP_SYSTEM, user, schema: REP_SCHEMA, maxTokens: 220, feature: "call" });
    const coachNote = directive.action === "book_callback" ? "Repeated objection — book a callback instead of re-pitching." : reaction.note;
    return { text: out.text, phase, done, tone: state.tone ?? reaction.tone, emotion: reaction.emotion, coachNote, source: "ai" };
  } catch {
    return fallbackRepTurn(state);
  }
}

// ---- prospect simulator (live role-play) ----
const PROSPECT_LINES: Record<Difficulty, string[]> = {
  easy: [
    "yeah, now's fine — what's up?",
    "sure, I've got a couple minutes. what's this about?",
    "oh hey, yeah — I've actually been meaning to look into this.",
  ],
  medium: [
    "I'm kind of in the middle of something — what do you need?",
    "honestly we're pretty happy with what we've got right now.",
    "what's this going to cost me? that's usually the dealbreaker.",
    "can you just email me something instead?",
  ],
  hard: [
    "look, I get these calls all day. why should I stay on?",
    "we already went with someone else last quarter.",
    "that sounds like every other pitch I've heard. does it actually work?",
    "now's really not a good time, call me next quarter or something.",
  ],
};

function fallbackProspectTurn(state: ConversationState, difficulty: Difficulty): ProspectTurn {
  const seed = `${state.dealTitle}|${state.turns.length}|${difficulty}`;
  // First prospect turn: greet/react to the opener. Later: raise an objection.
  const repTurns = state.turns.filter((t) => t.speaker === "rep").length;
  const pool = repTurns <= 1 && difficulty !== "hard" ? PROSPECT_LINES.easy : PROSPECT_LINES[difficulty];
  const text = pickVariant(pool, seeded(seed, "prospect"));
  const sentiment = detectSentiment(text);
  return { text, intent: detectIntent(text), sentiment, emotion: sentimentToEmotion(sentiment), source: "template" };
}

/** Generate a realistic prospect line for live role-play practice. */
export async function simulateProspect(state: ConversationState, difficulty: Difficulty = "medium"): Promise<ProspectTurn> {
  if (!isAiConfigured()) return fallbackProspectTurn(state, difficulty);
  const user = `Role-play a ${difficulty} prospect for "${state.dealTitle}" in ${state.industryLabel ?? "sales"}.
${languageDirective(state.language) ? `${languageDirective(state.language)}\n` : ""}TRANSCRIPT SO FAR:
${transcript(state.turns, "prospect")}

Say the prospect's next line out loud. React to what the rep just said.`;
  try {
    const out = await completeJson<{ text: string }>({ system: PROSPECT_SYSTEM, user, schema: PROSPECT_SCHEMA, maxTokens: 160, feature: "roleplay" });
    const sentiment = detectSentiment(out.text);
    return { text: out.text, intent: detectIntent(out.text), sentiment, emotion: sentimentToEmotion(sentiment), source: "ai" };
  } catch {
    return fallbackProspectTurn(state, difficulty);
  }
}

// ---- full-call driver ----
export interface CallResult {
  turns: Turn[];
  /** How the call wrapped: a booked next step, a graceful end, or the safety cap. */
  endedBy: "closed" | "ended" | "capped";
  repTurns: number;
  /** Each rep turn's reactive read, for a turn-by-turn coaching view. */
  beats: { tone: ToneId; emotion: Emotion; phase: CallPhase; coachNote: string }[];
  score: CallScore;
}

/**
 * Drive a complete call end to end: the rep opens, the prospect reacts, and the
 * two alternate — the rep adapting tone/emotion and handling each objection —
 * until the call naturally wraps (a booked next step, a gracious exit) or a
 * safety cap. Returns the transcript, the per-turn coaching beats, and the
 * post-call scorecard. Pure of side effects; works with or without an API key,
 * which makes the whole call loop testable. This is the backbone a live
 * telephony bridge drives (STT in → runCall step → TTS out).
 */
export async function runCall(
  state: ConversationState,
  opts: { difficulty?: Difficulty; maxRepTurns?: number } = {},
): Promise<CallResult> {
  const difficulty = opts.difficulty ?? "medium";
  const maxRep = Math.max(2, Math.min(opts.maxRepTurns ?? 12, 30));
  const turns: Turn[] = [...state.turns];
  const beats: CallResult["beats"] = [];
  let endedBy: CallResult["endedBy"] = "capped";
  let repTurns = 0;

  while (repTurns < maxRep) {
    const rep = await nextRepTurn({ ...state, turns });
    turns.push({ speaker: "rep", text: rep.text });
    beats.push({ tone: rep.tone, emotion: rep.emotion, phase: rep.phase, coachNote: rep.coachNote });
    repTurns += 1;
    if (rep.done) {
      endedBy = rep.phase === "closing" ? "closed" : "ended";
      break;
    }
    const prospect = await simulateProspect({ ...state, turns }, difficulty);
    turns.push({ speaker: "prospect", text: prospect.text });
  }

  return { turns, endedBy, repTurns, beats, score: analyzeCall(turns) };
}
