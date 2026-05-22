import { completeJson, isAiConfigured } from "@/lib/ai/client";

export interface ReplyInput {
  channel: "email" | "sms";
  contactName: string;
  company?: string;
  dealTitle: string;
  incoming: string;
  history?: string[];
  voice?: { senderName?: string; profile?: string; signature?: string };
}

export interface ReplyResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You are replying to a prospect's incoming message AS a specific human sales rep — never as an AI, bot, or template.
- Read the incoming message and respond to what they actually said. Address their question/objection directly and helpfully.
- Sound exactly like the rep (match the VOICE PROFILE when provided). Brief, warm, human, specific. No corporate filler or AI tells.
- Move things forward with one clear, low-friction next step, but never pushy. If they're not interested, be gracious.
- Email: a short subject (usually "Re: ...") + concise body. SMS: under 320 chars, no subject, conversational.
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
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
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
