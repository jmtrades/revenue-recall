import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { refineForHumanness } from "@/lib/ai/refine";
import { getPlaybook } from "@/lib/industries";
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

NEVER use AI tells: "I hope this finds you well", "I wanted to reach out", "circling back", "touch base", "feel free to", "don't hesitate", "let me know if you have any questions", "looking forward to hearing from you", or words like delve/leverage/utilize/elevate/streamline/robust/seamless. No hype, no exclamation spam, no buzzwords.
Return only the requested JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] };

type Intent = "decline" | "question" | "positive";

function detectIntent(incoming: string): Intent {
  const t = incoming.toLowerCase();
  if (/\b(not interested|no thanks|no thank you|stop|unsubscribe|pass|already (have|bought|went)|went with|all set)\b/.test(t)) return "decline";
  if (incoming.includes("?") || /\b(how much|what about|can you|do you|when|where|why|which|price|cost|quote)\b/.test(t)) return "question";
  return "positive";
}

function fallback(input: ReplyInput): ReplyResult {
  const first = firstName(input.contactName);
  const pb = getPlaybook(input.industryId ?? "generic");
  const seed = `${input.dealTitle}|${input.contactName}|${input.incoming.length}`;
  const sig = input.voice?.signature || input.voice?.senderName || "";
  const sigLine = sig ? `\n\n${sig}` : "";
  const intent = detectIntent(input.incoming);
  const sms = input.channel === "sms";
  const stepPool = input.voice?.customNextSteps?.length ? input.voice.customNextSteps : pb.nextSteps[sms ? "sms" : "email"];
  const greet = pick(GREETINGS_EMAIL, seed, "greet")(first);
  const step = pickVariant(stepPool, seeded(seed, "step"));

  let body: string;
  if (intent === "decline") {
    body = sms
      ? pick(
          [
            `no worries at all ${first} — thanks for letting me know. if anything changes down the road, i'm around.`,
            `all good ${first}, appreciate the heads up. door's open if things shift later.`,
            `got it ${first}, thanks for being straight with me. i'm here if that changes.`,
          ],
          seed,
          "decline_sms",
        )
      : `${greet}\n\n${pick(
          [
            "Totally understand — thanks for being straight with me. I'll leave it here, but if anything changes down the line, you know where to find me.",
            "No problem at all, and thanks for letting me know. I'll close this out on my end — I'm around anytime if that shifts.",
            "Fair enough, and I appreciate you telling me rather than leaving me guessing. I'll stop here; the door stays open.",
          ],
          seed,
          "decline_email",
        )}${sigLine}`;
  } else if (intent === "question") {
    body = sms
      ? `${pick(
          [`good question ${first}. short version: happy to get you a straight answer.`, `fair question ${first} — let me get you the real answer, not a guess.`, `great question ${first}. i'd rather get you the actual number.`],
          seed,
          "q_sms",
        )} ${sentence(step)}`
      : `${greet}\n\n${pick(
          ["Good question — happy to get you a clear answer rather than guess over email.", "Great question. Let me get you a straight answer instead of hand-waving it.", "Fair question, and I'd rather get you the real number than ballpark it."],
          seed,
          "q_email",
        )} ${sentence(capitalize(step))}${sigLine}`;
  } else {
    body = sms
      ? `${pick(
          [`thanks ${first}, appreciate you getting back.`, `nice one ${first} — thanks for the reply.`, `great, thanks ${first}.`],
          seed,
          "pos_sms",
        )} ${sentence(step)}`
      : `${greet}\n\n${pick(
          ["Thanks for getting back to me, appreciate it.", `Thanks ${first} — glad this is still live.`, "Great, and thanks for the quick reply."],
          seed,
          "pos_email",
        )} ${sentence(capitalize(step))}${sigLine}`;
  }

  return { subject: sms ? undefined : `Re: ${input.dealTitle}`, body, source: "template" };
}

export async function draftReply(input: ReplyInput): Promise<ReplyResult> {
  if (!isAiConfigured() || !input.incoming.trim()) return fallback(input);
  const pb = getPlaybook(input.industryId ?? "generic");
  const user = `Channel: ${input.channel}
${input.industryLabel ? `Industry: ${input.industryLabel}\n` : ""}Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}"
${input.voice?.senderName ? `You are: ${input.voice.senderName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}\n` : ""}
THEIR INCOMING MESSAGE:
"""${input.incoming}"""

How a real ${input.industryLabel ?? "sales"} rep talks (match the spirit, don't copy):
- Natural next steps: ${pb.nextSteps[input.channel].join(" / ")}
- Objections you might be answering: ${pb.objections.join("; ")}
${input.voice?.profile ? `\nWrite in THIS person's voice — match it so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}

Write the reply now, as this human. Answer what they actually said.`;
  try {
    const raw = await completeJson<{ subject?: string; body: string }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 900, temperature: 0.9 });
    const out = await refineForHumanness({ system: SYSTEM, schema: SCHEMA, draft: raw, maxTokens: 900 });
    return { subject: input.channel === "email" ? out.subject : undefined, body: out.body, source: "ai" };
  } catch {
    return fallback(input);
  }
}
