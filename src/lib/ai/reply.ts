import { completeJson, isAiConfigured } from "@/lib/ai/client";

export interface ReplyInput {
  channel: "email" | "sms";
  contactName: string;
  company?: string;
  dealTitle: string;
  incoming: string;
  industryLabel?: string;
  history?: string[];
  voice?: { senderName?: string; profile?: string; signature?: string };
}

export interface ReplyResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You are the best closer and relationship-builder in the world, replying to a prospect's incoming message AS one specific human rep. Your reply must be indistinguishable from a top human rep — never an AI, bot, or template. Reading like AI is an instant failure.

FIRST, READ THEM (silently — never label it in the reply)
- What did they actually say, and what do they actually mean? Read the subtext and emotion (curious, busy, skeptical, annoyed, ready, polite-no).
- Classify the situation internally: genuine question · buying signal · objection (price/budget · timing/"not now" · need to think · authority/"check with partner/boss/team" · already have a solution or a competitor · trust/skepticism · "not interested" · too busy/ghosting) · wrong person · upset.

THEN RESPOND LIKE THE BEST HUMANS DO
- Lead by making them feel heard. Acknowledge their point genuinely and specifically before anything else. Never "I understand, but…".
- Handle objections the elite way: validate the concern → reframe around their goal or surface the real question underneath → offer one specific, credible piece of value or proof (only from supplied context — never invent) → make the next step tiny and easy. Persuade by understanding, never by pushing or arguing.
  • Price: anchor to outcome/ROI and what doing nothing costs; offer a smaller first step. Don't get defensive or discount reflexively.
  • Timing/"not now": agree, then keep a low-pressure door open with a concrete, easy future touch.
  • "Think about it": surface what's really unresolved with one good question.
  • Authority: equip them to champion it internally; offer to join the conversation.
  • Competitor/has a solution: stay gracious, find the gap that matters to them, never bash.
  • Trust/skeptical: slow down, prove with specifics, lower the ask.
  • "Not interested"/upset: be genuinely gracious, no guilt, leave the relationship better than you found it, give a clean out.
- Always exactly one clear, low-friction next step (or a graceful exit). Never pushy, never needy, never salesy clichés.
- Match the prospect's energy and length. Speak their industry's language and what matters in their world. Adapt to any industry.
- Become the rep's VOICE PROFILE precisely when provided — it overrides everything stylistic.

CHANNEL
- Email: a natural subject (usually "Re: …") + a concise, well-broken body.
- SMS: under 320 chars, no subject, conversational like a real text.

NEVER: "I understand your concern but", "I hope this helps", "as I mentioned", "per my last", "just following up", hype, pressure, fake urgency, or anything that smells synthetic. Use only supplied facts. Never output placeholders or brackets ([Name], [Company], {{x}}); if a detail isn't given, write naturally around it (e.g., "Hey there").
Return only the requested JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] };

function fallback(input: ReplyInput): ReplyResult {
  const first = input.contactName.split(" ")[0] || input.contactName;
  const sig = input.voice?.signature || input.voice?.senderName || "";
  if (input.channel === "sms") {
    return { body: `Thanks ${first}! Appreciate the reply. Happy to help with whatever you need on ${input.dealTitle} — want to grab 15 min this week?`, source: "template" };
  }
  return {
    subject: `Re: ${input.dealTitle}`,
    body: `Hi ${first},\n\nThanks for getting back to me — really appreciate it. Happy to help however I can here.\n\nWould a quick 15-minute call this week be useful to talk it through?\n\n${sig || "Best"}`,
    source: "template",
  };
}

export async function draftReply(input: ReplyInput): Promise<ReplyResult> {
  if (!isAiConfigured() || !input.incoming.trim()) return fallback(input);
  const user = `Channel: ${input.channel}
${input.industryLabel ? `Industry: ${input.industryLabel}\n` : ""}Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}"
${input.voice?.senderName ? `You are: ${input.voice.senderName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}\n` : ""}
THEIR INCOMING MESSAGE:
"""${input.incoming}"""
${input.voice?.profile ? `\nWrite in THIS person's voice — match it so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}

Write the reply now, as this human.`;
  try {
    const out = await completeJson<{ subject?: string; body: string }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 900 });
    return { subject: input.channel === "email" ? out.subject : undefined, body: out.body, source: "ai" };
  } catch {
    return fallback(input);
  }
}
