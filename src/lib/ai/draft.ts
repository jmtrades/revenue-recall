import { completeJson, isAiConfigured } from "@/lib/ai/client";

export interface DraftInput {
  channel: "email" | "sms" | "call";
  contactName: string;
  company?: string;
  dealTitle: string;
  valueLabel: string;
  value: number;
  currency: string;
  stageLabel: string;
  industryLabel: string;
  recallReason?: string;
  daysSinceContact?: number;
  history?: string[];
  repName?: string;
  /** Optional extra instruction from a user-defined Autopilot task. */
  instruction?: string;
  /** The rep's distilled writing voice + sign-off, so messages sound like them. */
  voice?: { senderName?: string; profile?: string; signature?: string };
}

export interface DraftResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You are the single best sales communicator alive, ghostwriting a message AS one specific human rep. The output must be indistinguishable from a sharp, well-liked rep typing on their phone — never an AI, assistant, bot, or template. If a reader could even suspect AI, you have failed.

WHO YOU ARE
- You are this rep, a real person with a real relationship to this prospect. Never reveal, hint at, or imply AI. No disclaimers, no "I hope this finds you well", no robotic scaffolding.
- When a VOICE PROFILE is given, become that person exactly: their tone, rhythm, greetings, sign-off, favorite words, contractions, capitalization, emoji habits, punctuation quirks. Fidelity to their voice beats every other rule.

CRAFT (how elite reps actually write)
- Lead with them, not you. Open on their world, their goal, or the last real moment between you — never your product or your need.
- Earn the reply. One clear, low-friction ask. Make saying yes (or "not now") effortless. Never stack asks, never pressure.
- Be specific and human: reference real context, vary sentence length, let it breathe. A great message often reads a little imperfect — that's human.
- Brevity is respect. Cut every word that isn't pulling weight.
- Create a reason to respond now without manufactured urgency or hype.

ADAPT TO THE INDUSTRY
- Speak the prospect's language. Mirror how deals actually move in their world (real estate, mortgage, insurance, SaaS, agencies, auto, home services, healthcare, anything). Use their vocabulary and what they actually care about. When unsure, sound like a knowledgeable insider, never generic.

CHANNEL
- Email: a human subject (curiosity or specificity, not salesy) + 40-110 word body. Real paragraphs/line breaks.
- SMS: under 320 chars, no subject, lowercase-casual is fine, like a text to someone you know.
- Call: a tight 4-6 bullet talk track in the body (no subject) — opener, the one thing to learn, value tied to their goal, likely objection + response, a concrete next step.

NEVER
- Clichés: "I hope this email finds you well", "I wanted to reach out", "just checking in", "circling back", "touching base", "synergy", "leverage", "at your earliest convenience", "kindly".
- Corporate throat-clearing, hype, exclamation spam, em-dash overuse, or three-adjective stacks.
- Inventing facts. Use only the supplied context.
- Placeholders or brackets of any kind ([Name], [Company], {{first}}, <X>). If a detail isn't given, write naturally around it (e.g., "Hey there") — never leave a fill-in.

RE-ENGAGEMENT (cold/winnable-lost)
- Acknowledge the gap like a human ("been a minute"), lead with a genuine reason or an easy, no-pressure ask, and always give a graceful out. Warmth over guilt.

Return only the requested JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
};

function fallback(input: DraftInput): DraftResult {
  const first = input.contactName.split(" ")[0] || input.contactName;
  const rep = input.voice?.signature || input.voice?.senderName || input.repName || "";
  const cold = (input.daysSinceContact ?? 0) >= 14 || input.recallReason === "lost_winnable";

  if (input.channel === "sms") {
    const body = cold
      ? `Hi ${first}, it's ${rep || "us"} — circling back on ${input.dealTitle}. Worth a quick chat this week? Totally fine if the timing's off.`
      : `Hi ${first}, following up on ${input.dealTitle}. Any questions I can answer to help you decide? Happy to jump on a quick call.`;
    return { body, source: "template" };
  }

  if (input.channel === "call") {
    return {
      body: [
        `• Open warm: reference ${input.company ?? "their goals"} and the last touch (${input.daysSinceContact ?? 0} days ago).`,
        `• Re-confirm the goal behind "${input.dealTitle}".`,
        cold ? "• Acknowledge time passed; offer a fresh angle or incentive." : "• Surface any blocker keeping this from moving forward.",
        `• Quantify value (${input.valueLabel}: ${input.value} ${input.currency}).`,
        "• Propose a concrete next step + date. Confirm before hanging up.",
      ].join("\n"),
      source: "template",
    };
  }

  const subject = cold ? `Still worth a conversation, ${first}?` : `Next steps on ${input.dealTitle}`;
  const body = cold
    ? `Hi ${first},\n\nIt's been a little while since we talked about ${input.dealTitle}. Circumstances change, so I wanted to check in — is this still on your radar?\n\nIf helpful, I can send a fresh proposal or just close the loop. Either way works.\n\nBest,\n${rep}`
    : `Hi ${first},\n\nFollowing up on ${input.dealTitle}. We left off at the ${input.stageLabel.toLowerCase()} stage — I'd love to help you take the next step.\n\nWould a quick 15-minute call this week make sense?\n\nBest,\n${rep}`;
  return { subject, body, source: "template" };
}

export async function draftMessage(input: DraftInput): Promise<DraftResult> {
  if (!isAiConfigured()) return fallback(input);

  const user = `Channel: ${input.channel}
Industry: ${input.industryLabel}
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}" — ${input.valueLabel} ${input.value} ${input.currency}, currently at stage "${input.stageLabel}"
${input.recallReason ? `Recall reason: ${input.recallReason}\n` : ""}${input.daysSinceContact !== undefined ? `Days since last contact: ${input.daysSinceContact}\n` : ""}${input.voice?.senderName || input.repName ? `You are: ${input.voice?.senderName ?? input.repName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}` : "No prior activity logged."}
${input.voice?.profile ? `\nWrite in THIS person's voice — match it exactly so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}${input.instruction ? `\nAlso follow this instruction for this message:\n"""${input.instruction}"""` : ""}

Write the ${input.channel} message now, as this human.`;

  try {
    const out = await completeJson<{ subject?: string; body: string }>({
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 1024,
    });
    return {
      subject: input.channel === "email" ? out.subject : undefined,
      body: out.body,
      source: "ai",
    };
  } catch {
    return fallback(input);
  }
}
