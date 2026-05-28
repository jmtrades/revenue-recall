import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { refineForHumanness } from "@/lib/ai/refine";
import { getPlaybook } from "@/lib/industries";
import { getTone, type ToneId } from "@/lib/tones";
import { capitalize, firstName, pickVariant, pick, seeded, sentence, GREETINGS_EMAIL } from "@/lib/copy";

export interface ReplyInput {
  channel: "email" | "sms";
  contactName: string;
  company?: string;
  dealTitle: string;
  industryLabel?: string;
  industryId?: string;
  incoming: string;
  history?: string[];
  voice?: { senderName?: string; profile?: string; signature?: string; customNextSteps?: string[]; customReengage?: string[] };
  tone?: ToneId;
}

export interface ReplyResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You are replying to a prospect's incoming message AS a specific human sales rep — never as an AI, a bot, or a template. If it reads like AI, you failed.

- Read what they actually said and respond to it. Answer the question or address the objection directly and helpfully. Don't dodge.
- Sound exactly like the rep (match the VOICE PROFILE when given). Use contractions, vary your sentence length, be warm, brief, and specific to them and this deal.
- When an INDUSTRY PLAYBOOK is given, talk like a real rep in that business and use their natural next-steps.
- Move things forward with one clear, low-friction step — but never pushy. If they're not interested, be genuinely gracious and leave the door open.
- Email: a short subject (usually "Re: ...") + concise body. SMS: under 320 chars, lowercase-casual is fine, no subject.

HANDLING OBJECTIONS (this is where most reps sound robotic — you must not):
- Never argue or get defensive. First, genuinely acknowledge their point as fair. Then briefly answer or reframe. Then ask ONE easy question that moves it forward.
- Price/"too expensive": don't lead with a discount. Anchor to the outcome/value and what it's worth, then ask about their actual budget or priority.
- Timing/"not right now": take the pressure off, make it painless to pick back up, and pin a soft date instead of a vague "later".
- Competitor/"already using X": stay gracious, no trash-talk. Get curious about what's working and where the gap is.
- Skeptical/"does it really work": offer proof (a specific example/result), not promises, then a tiny low-risk next step.
- "Just send info": ask one quick question so you send the *right* thing, instead of firing off a brochure.

NEVER use AI tells: "I hope this finds you well", "I wanted to reach out", "circling back", "touch base", "feel free to", "don't hesitate", "let me know if you have any questions", "looking forward to hearing from you", or words like delve/leverage/utilize/elevate/streamline/robust/seamless. No hype, no exclamation spam, no buzzwords.
Return only the requested JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] };

export type Intent =
  | "hostile"
  | "spam"
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
export type SituationalIntent = "authority" | "budget" | "busy" | "spam" | "confused" | "hostile";

const OBJECTION_KINDS = new Set<Intent>(["price", "timing", "competitor", "trust", "info"]);
const SITUATIONAL_KINDS = new Set<Intent>(["authority", "budget", "busy", "spam", "confused", "hostile"]);

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
  if (/\b(can'?t (talk|chat)|in a meeting|i'?m driving|driving right now|catch me later|call me (back|later)|bad time to talk|at work right now|on my way|in the middle of|gimme a sec)\b/.test(t)) return "busy";
  if (/\b(not my (call|decision)|talk to my (boss|manager|partner|wife|husband|spouse|team)|run it by|check with (my|the|him|her|them)|needs? approval|loop in|someone else (handles|decides)|not the (decision|one who decides)|above my pay)\b/.test(t)) return "authority";
  if (/\b(no budget|do ?n'?t have (the |a )?budget|can'?t afford|out of (our )?budget|budget('?s| is)? (tight|frozen|gone|cut|maxed)|no money|spent (our|the) budget|nothing left in the budget)\b/.test(t)) return "budget";
  if (/\b(who('?s| is) this|what('?s| is) this( about| regarding)?|do i know you|what company|never heard of|what is this in regards)\b/.test(t)) return "confused";
  if (/\b(not interested|no thanks|no thank you|unsubscribe|please remove|take me off|already (sold|closed)|not for us|we'?ll pass|gonna pass|hard pass)\b/.test(t)) return "decline";
  if (/\b(went with|going with|already (have|using|bought|got)|we use|we'?ve got|signed with|chose|have a (vendor|provider|solution|agent|lender|broker|guy))\b/.test(t)) return "competitor";
  if (/\b(how much|price|pricing|cost|costs|expensive|too much|discount|quote|ballpark|rates?)\b/.test(t)) return "price";
  if (/\b(not (right )?now|not the right time|next (quarter|month|year|week)|maybe later|circle back|reach back|check back|not a priority|after the holidays|q[1-4])\b/.test(t)) return "timing";
  if (/\b(does (it|this) (really|actually)|proof|case study|references?|guarantee|not sure (it|this) works|sounds too good|is this legit|scam|skeptical|trust)\b/.test(t)) return "trust";
  if (/\b(send (me|over|info|details|something|that)|email me|brochure|more (info|details|information)|one[- ]?pager|deck|literature)\b/.test(t)) return "info";
  if (incoming.includes("?") || /\b(what about|can you|do you|when|where|why|which|who)\b/.test(t)) return "question";
  return "positive";
}

/**
 * Universal human responses for the intents that aren't reframed with an
 * industry angle. decline/hostile exit graciously (no question). question/
 * positive get the industry next-step appended. Every line is checked clean of
 * AI tells by the test suite.
 */
const RESPONSES: Record<"decline" | "question" | "positive", { sms: (f: string) => string[]; email: (f: string) => string[] }> = {
  decline: {
    sms: (f) => [
      `no worries at all ${f} — thanks for telling me straight. i'll leave you be. if anything changes, i'm here.`,
      `all good ${f}, appreciate the honesty. door's open if things ever shift.`,
      `got it ${f} — thanks for being upfront. i'm around if that ever changes.`,
    ],
    email: (f) => [
      `Totally understand, and thanks for being straight with me. I'll leave it here — if anything changes down the line, you know where to find me.`,
      `No problem at all, and I appreciate you telling me rather than leaving me guessing. I'll close this out; the door stays open.`,
      `Fair enough — thanks for the honesty, ${f}. I'll stop here, but I'm around anytime if that shifts.`,
    ],
  },
  question: {
    sms: (f) => [
      `good question ${f}. short version: i'd rather get you a straight answer than a guess.`,
      `fair question ${f} — let me get you the real answer, not a maybe.`,
      `great question ${f}. here's the honest take:`,
    ],
    email: (f) => [
      `Good question — I'd rather get you a clear answer than guess over email.`,
      `Great question, ${f}. Let me give you a straight answer instead of hand-waving it.`,
      `Fair question, and I'd rather get you the real detail than ballpark it.`,
    ],
  },
  positive: {
    sms: (f) => [
      `thanks ${f}, appreciate you getting back.`,
      `nice one ${f} — thanks for the reply.`,
      `great, thanks ${f}.`,
    ],
    email: (f) => [
      `Thanks for getting back to me, appreciate it.`,
      `Thanks ${f} — glad this is still live.`,
      `Great, and thanks for the quick reply.`,
    ],
  },
};

/**
 * Situational responses — the things people actually say on calls beyond the
 * classic objections. Each handles it like a real human would: acknowledge,
 * address, and (except hostile/decline) end on an easy question. Takes the deal
 * title so "who is this?" gets real context.
 */
const SITUATIONAL: Record<SituationalIntent, { sms: (f: string, deal: string) => string[]; email: (f: string, deal: string) => string[] }> = {
  authority: {
    sms: (f) => [`makes sense ${f} — who else'd want a say before you move on this?`, `fair ${f}, who else is in on this decision with you?`, `got it — who'd you want to loop in before deciding?`],
    email: (f) => [`Makes total sense — who else would want a say before you move on this?`, `Fair enough, ${f}. Who else is part of this decision with you?`, `Good to know — who would you want to bring in before you decide?`],
  },
  budget: {
    sms: (f) => [`totally fair ${f}. is it that the budget's not there this cycle, or that the value isn't clear yet?`, `fair ${f} — is budget the blocker, or is it more whether it's worth it?`, `got it. would it help to look at what it'd actually save you first?`],
    email: (f) => [`Totally fair. Is it that the budget isn't there this cycle, or that the value isn't clear enough yet?`, `Fair enough, ${f}. Is budget the real blocker, or is it more whether this earns its keep?`, `Understood — would it help to see what it'd actually save you before we talk numbers?`],
  },
  busy: {
    sms: (f) => [`no worries ${f}, sounds like i caught you mid-something. when's better, later today or tomorrow?`, `all good — bad time? give me a better one and i'll catch you then.`, `got it ${f}, want me to be quick now or try you later?`],
    email: (f) => [`No worries — sounds like I caught you mid-something. When's better, later today or tomorrow?`, `All good, ${f}. Give me a better time and I'll catch you then.`, `Totally fine — want me to be quick now, or try you later?`],
  },
  spam: {
    sms: (f) => [`fair to ask ${f} — i'm a real person, not a robocall. want the 20-second why, then you decide?`, `honest question. i'm a real human with a specific reason — want me to keep it quick?`, `no robot here ${f}. can i give you the short version and you tell me to back off if it's not useful?`],
    email: (f) => [`Fair to ask. I'm a real person, not a robocall — want the 20-second version of why I'm calling, then you decide?`, `Honest question, and fair. I'm a real human with a specific reason — want me to keep it quick?`, `No robocall here, ${f}. Can I give you the short version, and you tell me to back off if it's not useful?`],
  },
  confused: {
    sms: (f, deal) => [`good question ${f} — i'm calling about ${deal}. want the short version of why it might matter to you?`, `fair — this is about ${deal}. worth 20 seconds?`, `totally fair ${f}. it's about ${deal} — want the quick why?`],
    email: (f, deal) => [`Good question — I'm calling about ${deal}. Want the short version of why it might matter to you?`, `Fair enough, ${f}. This is about ${deal} — want the quick why?`, `Totally fair. It's about ${deal} — worth twenty seconds of context?`],
  },
  hostile: {
    sms: (f) => [`i hear you ${f}, and i won't keep you. i'll leave it here — take care.`, `understood, i'll stop there. sorry to bug you — all the best.`, `got it, i'll back off completely. take care ${f}.`],
    email: (f) => [`I hear you, and I won't keep you. I'll leave it here — take care.`, `Understood — I'll stop there. Sorry to have bugged you, all the best.`, `Got it, I'll back off completely. Take care, ${f}.`],
  },
};

function fallback(input: ReplyInput): ReplyResult {
  const first = firstName(input.contactName);
  const pb = getPlaybook(input.industryId ?? "generic");
  const tonePart = input.tone && input.tone !== "warm" ? `|${input.tone}` : "";
  const seed = `${input.dealTitle}|${input.contactName}|${input.incoming.length}${tonePart}`;
  const sig = input.voice?.signature || input.voice?.senderName || "";
  const sigLine = sig ? `\n\n${sig}` : "";
  const intent = detectIntent(input.incoming);
  const sms = input.channel === "sms";
  const stepPool = input.voice?.customNextSteps?.length ? input.voice.customNextSteps : pb.nextSteps[sms ? "sms" : "email"];
  const greet = pick(GREETINGS_EMAIL, seed, "greet")(first);
  const step = pickVariant(stepPool, seeded(seed, "step"));
  const appendStep = intent === "question" || intent === "positive";

  const ackPool = { sms: ["totally fair", "fair one", "makes sense", "good question"], email: ["Totally fair", "Fair question", "Makes sense", "Good question"] };

  let body: string;
  if (OBJECTION_KINDS.has(intent)) {
    // Classic objection → industry-true reframe that already ends on a question,
    // so it sounds like a rep who knows this exact business.
    const angle = pb.objectionAngles[intent as ObjectionKind];
    body = sms
      ? `${pick(ackPool.sms, seed, "ack")}. ${angle}`
      : `${greet}\n\n${pick(ackPool.email, seed, "ack")}. ${capitalize(angle)}${sigLine}`;
  } else if (SITUATIONAL_KINDS.has(intent)) {
    // Real-call situations (busy, who-is-this, decision-maker, hostile, ...).
    const r = SITUATIONAL[intent as SituationalIntent];
    body = sms
      ? pick(r.sms(first, input.dealTitle), seed, `${intent}_sms`)
      : `${greet}\n\n${pick(r.email(first, input.dealTitle), seed, `${intent}_email`)}${sigLine}`;
  } else {
    const base = intent === "decline" || intent === "question" || intent === "positive" ? intent : "positive";
    if (sms) {
      const ack = pick(RESPONSES[base].sms(first), seed, `${base}_sms`);
      body = appendStep ? `${ack} ${sentence(step)}` : ack;
    } else {
      const ack = pick(RESPONSES[base].email(first), seed, `${base}_email`);
      body = `${greet}\n\n${ack}${appendStep ? ` ${sentence(capitalize(step))}` : ""}${sigLine}`;
    }
  }

  return { subject: sms ? undefined : `Re: ${input.dealTitle}`, body, source: "template" };
}

export async function draftReply(input: ReplyInput): Promise<ReplyResult> {
  if (!isAiConfigured() || !input.incoming.trim()) return fallback(input);
  const pb = getPlaybook(input.industryId ?? "generic");
  const tone = getTone(input.tone);
  const user = `Channel: ${input.channel}
${input.industryLabel ? `Industry: ${input.industryLabel}\n` : ""}Tone: ${tone.label} — ${tone.directive}
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}"
${input.voice?.senderName ? `You are: ${input.voice.senderName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}\n` : ""}
THEIR INCOMING MESSAGE:
"""${input.incoming}"""

How a real ${input.industryLabel ?? "sales"} rep talks (match the spirit, don't copy):
- Natural next steps: ${pb.nextSteps[input.channel].join(" / ")}
- Objections you might be answering: ${pb.objections.join("; ")}
- How a pro in this business reframes each objection (match this angle, your words):
  • Price: ${pb.objectionAngles.price}
  • Timing: ${pb.objectionAngles.timing}
  • Competitor: ${pb.objectionAngles.competitor}
  • Skeptical: ${pb.objectionAngles.trust}
  • "Just send info": ${pb.objectionAngles.info}
${input.voice?.customNextSteps?.length ? `\nThis rep's own go-to next steps (prefer one when it fits): ${input.voice.customNextSteps.join(" / ")}` : ""}${input.voice?.profile ? `\nWrite in THIS person's voice — match it so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}

Write the reply now, as this human. Answer what they actually said.`;
  try {
    const raw = await completeJson<{ subject?: string; body: string }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 900, temperature: 0.9 });
    const out = await refineForHumanness({ system: SYSTEM, schema: SCHEMA, draft: raw, maxTokens: 900 });
    return { subject: input.channel === "email" ? out.subject : undefined, body: out.body, source: "ai" };
  } catch {
    return fallback(input);
  }
}
