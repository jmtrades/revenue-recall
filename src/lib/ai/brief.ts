import { completeJson, isAiConfigured } from "@/lib/ai/client";

export interface BriefInput {
  contactName: string;
  company?: string;
  dealTitle: string;
  valueLabel: string;
  value: number;
  currency: string;
  stageLabel: string;
  stageType: string;
  industryLabel: string;
  daysSinceContact?: number;
  history?: string[];
}

export interface BriefResult {
  summary: string;
  nextStep: string;
  talkingPoints: string[];
  risk: "low" | "medium" | "high";
  source: "ai" | "template";
}

const SYSTEM = `You are the sharpest sales strategist alive, briefing a rep in the 30 seconds before they work a deal. Think like a top closer who has seen 10,000 deals.
- Read the real story in the history: where momentum is, what's unsaid, where it's stalling and why. Infer the likely blocker and the prospect's actual motivation.
- Ground every statement in the supplied context — never invent facts. If something's unknown, say what to find out.
- Be concrete and decisive. No fluff, no hedging, no generic advice that fits any deal.
Produce:
- summary: 1-2 sentences capturing the true state of the deal and the core tension.
- nextStep: the single highest-leverage next move, specific enough to act on today.
- talkingPoints: 2-4 sharp, tailored points — tie value to THEIR goal, the smartest discovery question to ask, and the most likely objection with how to handle it. Speak the industry's language.
- risk: low / medium / high probability of losing this deal, judged from stage, momentum, and time elapsed.
Return only the requested JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    nextStep: { type: "string" },
    talkingPoints: { type: "array", items: { type: "string" } },
    risk: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "nextStep", "talkingPoints", "risk"],
};

function fallback(input: BriefInput): BriefResult {
  const days = input.daysSinceContact ?? 0;
  const risk: BriefResult["risk"] = input.stageType === "lost" ? "high" : days >= 30 ? "high" : days >= 14 ? "medium" : "low";
  return {
    summary: `${input.contactName}${input.company ? ` (${input.company})` : ""} is at the ${input.stageLabel} stage on "${input.dealTitle}" (${input.value} ${input.currency}). Last contact was ${days} day${days === 1 ? "" : "s"} ago.`,
    nextStep:
      risk === "high"
        ? "Re-engage today with a value-led, low-friction touch before this goes fully cold."
        : "Confirm the next concrete step and put a date on it.",
    talkingPoints: [
      `Reconfirm the goal behind "${input.dealTitle}".`,
      `Tie the conversation to ${input.valueLabel.toLowerCase()} and timeline.`,
      days >= 14 ? "Acknowledge the gap since last contact and offer a fresh angle." : "Surface and remove any remaining blocker.",
    ],
    risk,
    source: "template",
  };
}

export async function summarizeDeal(input: BriefInput): Promise<BriefResult> {
  if (!isAiConfigured()) return fallback(input);

  const user = `Industry: ${input.industryLabel}
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}" — ${input.valueLabel} ${input.value} ${input.currency}
Stage: ${input.stageLabel} (${input.stageType})
${input.daysSinceContact !== undefined ? `Days since last contact: ${input.daysSinceContact}\n` : ""}${input.history && input.history.length ? `History (newest first):\n- ${input.history.slice(0, 8).join("\n- ")}` : "No activity logged."}

Brief the rep now.`;

  try {
    const out = await completeJson<Omit<BriefResult, "source">>({
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 1200,
      think: true,
    });
    return { ...out, source: "ai" };
  } catch {
    return fallback(input);
  }
}
