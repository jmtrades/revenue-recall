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
}

export interface DraftResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You are an elite B2B/B2C sales copywriter embedded in a sales platform.
You write outreach that gets replies: concise, specific, human, and respectful of the prospect's time.

Rules:
- Match the channel. Email: a short subject + 60-110 word body. SMS: under 320 characters, no subject. Call: a 4-6 bullet talk track (put it in the body, no subject).
- Personalize from the supplied context (name, company, stage, what's happened). Never invent facts not given.
- One clear call to action. No hype, no jargon, no "I hope this email finds you well".
- For re-engagement (cold/lost deals): acknowledge time has passed, lead with a fresh reason or low-friction ask, give an easy out.
- Warm, confident, peer-to-peer tone. Use the rep's first name to sign off if provided.
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
  const rep = input.repName ?? "";
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
${input.recallReason ? `Recall reason: ${input.recallReason}\n` : ""}${input.daysSinceContact !== undefined ? `Days since last contact: ${input.daysSinceContact}\n` : ""}${input.repName ? `Rep (sign-off): ${input.repName}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}` : "No prior activity logged."}

Write the ${input.channel} message now.`;

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
