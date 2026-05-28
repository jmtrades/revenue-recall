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

export type Intent = "decline" | "competitor" | "price" | "timing" | "trust" | "info" | "question" | "positive";

/**
 * Classify the prospect's incoming message so the reply can address what they
 * actually said. Order matters: the most specific, most actionable objections
 * are checked first (a "send me pricing" should be handled as price, not as a
 * generic question).
 */
export function detectIntent(incoming: string): Intent {
  const t = incoming.toLowerCase();
  if (/\b(not interested|no thanks|no thank you|stop|unsubscribe|please remove|take me off|already (sold|closed))\b/.test(t)) return "decline";
  if (/\b(went with|going with|already (have|using|bought|got)|we use|we've got|signed with|chose|have a (vendor|provider|solution|agent|lender|broker|guy))\b/.test(t)) return "competitor";
  if (/\b(how much|price|pricing|cost|costs|expensive|too much|budget|afford|discount|quote|ballpark|rates?)\b/.test(t)) return "price";
  if (/\b(not (right )?now|not the right time|next (quarter|month|year|week)|later|busy|swamped|circle back|reach out in|check back|bad time|not a priority|after the holidays|q[1-4])\b/.test(t)) return "timing";
  if (/\b(does (it|this) (really|actually)|proof|case study|references?|guarantee|not sure (it|this) works|sounds too good|is this legit|scam|skeptical|trust)\b/.test(t)) return "trust";
  if (/\b(send (me|over|info|details|something|that)|email me|brochure|more (info|details|information)|one[- ]?pager|deck|literature)\b/.test(t)) return "info";
  if (incoming.includes("?") || /\b(what about|can you|do you|when|where|why|which|who)\b/.test(t)) return "question";
  return "positive";
}

/**
 * Human responses per intent. Objection intents (competitor/price/timing/trust/
 * info) acknowledge first, then end in one easy question — that question IS the
 * ask, so no generic next-step is appended. decline exits graciously with no
 * ask. question/positive get the industry next-step appended as the ask.
 * Every line is checked clean of AI tells by the test suite.
 */
const RESPONSES: Record<Intent, { sms: (f: string) => string[]; email: (f: string) => string[] }> = {
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
  competitor: {
    sms: (f) => [
      `makes sense ${f}, glad you're sorted. out of interest, what tipped you their way?`,
      `nice ${f} — good you've got someone. what's working well with them so far?`,
      `all good ${f}. curious, is there anything they're not quite covering for you?`,
    ],
    email: (f) => [
      `Makes sense, and glad you're sorted. Out of interest — what tipped you their way?`,
      `Good you've got someone in place, ${f}. Quick one: is there anything they're not quite covering for you?`,
      `Fair enough, and I'm not here to talk anyone down — just curious what's working well so far?`,
    ],
  },
  price: {
    sms: (f) => [
      `fair question ${f}. it scales to what you actually need — what budget are you working with?`,
      `good one ${f}. straight answer: it depends on scope. what range were you hoping to stay under?`,
      `happy to get you a number ${f}. what's the priority — keep it lean, or do it properly?`,
    ],
    email: (f) => [
      `Fair question, and I'd rather get you a real number than a ballpark. It scales to what you actually need — what budget are you working with?`,
      `Happy to get you pricing, ${f}. It depends on scope, so quick one: what range were you hoping to stay under?`,
      `Straight answer: it depends on what matters most to you here. What's the priority — keep it lean, or do this properly?`,
    ],
  },
  timing: {
    sms: (f) => [
      `totally fair ${f} — no rush at all. want me to check back in a few weeks when it's calmer?`,
      `makes sense ${f}, timing's everything. should i ping you early next month instead?`,
      `all good ${f} — when's realistically a better time for you?`,
    ],
    email: (f) => [
      `Totally fair — no rush on my end. Want me to check back in a few weeks when things have calmed down?`,
      `Makes sense, timing matters more than people admit. When's realistically a better moment — early next month?`,
      `No pressure at all, ${f}. Tell me a better time and I'll get out of your way until then.`,
    ],
  },
  trust: {
    sms: (f) => [
      `fair to be skeptical ${f}. i'd rather show you than tell you — want a quick example from someone like you?`,
      `good instinct ${f}. happy to send one real result, not a pitch. want it?`,
      `totally get it ${f}. what would you need to see to believe it actually works?`,
    ],
    email: (f) => [
      `Fair to be skeptical — I'd be too. I'd rather show you than tell you: want a quick example from someone in your spot?`,
      `Good instinct, ${f}. Instead of promises, let me send one real result. What would you need to see to feel sure?`,
      `Honestly, a bit of skepticism is healthy here. What would it take to prove this is worth your time?`,
    ],
  },
  info: {
    sms: (f) => [
      `happy to ${f}. quick q so i send the right thing, not a brochure — what matters most to you here?`,
      `can do ${f}. one question first so it's actually useful: what are you trying to solve?`,
      `sure ${f} — i'll send exactly what's useful and skip the fluff. what's the main thing you want this to fix?`,
    ],
    email: (f) => [
      `Happy to. Quick question first so I send the right thing rather than a generic brochure — what matters most to you here?`,
      `Can do, ${f}. One thing first so it's actually useful: what are you trying to solve?`,
      `Sure — I'll send exactly what's useful and skip the brochure. What's the main thing you want this to fix?`,
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

  // Objections get an industry-true reframe that already ends on a question, so
  // a price/timing/competitor/trust/info reply sounds like a rep who knows this
  // exact business. Everything else uses the universal human responses.
  const isObjection = intent === "price" || intent === "timing" || intent === "competitor" || intent === "trust" || intent === "info";
  const ackPool = { sms: ["totally fair", "fair one", "makes sense", "good question"], email: ["Totally fair", "Fair question", "Makes sense", "Good question"] };

  let body: string;
  if (isObjection) {
    const angle = pb.objectionAngles[intent];
    if (sms) {
      body = `${pick(ackPool.sms, seed, "ack")}. ${angle}`;
    } else {
      body = `${greet}\n\n${pick(ackPool.email, seed, "ack")}. ${capitalize(angle)}${sigLine}`;
    }
  } else if (sms) {
    const ack = pick(RESPONSES[intent].sms(first), seed, `${intent}_sms`);
    body = appendStep ? `${ack} ${sentence(step)}` : ack;
  } else {
    const ack = pick(RESPONSES[intent].email(first), seed, `${intent}_email`);
    body = `${greet}\n\n${ack}${appendStep ? ` ${sentence(capitalize(step))}` : ""}${sigLine}`;
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
