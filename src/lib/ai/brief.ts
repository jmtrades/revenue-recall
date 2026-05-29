import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { languageDirective } from "@/lib/languages";

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
  /** ISO 639-1 language to write the brief in (default English). */
  language?: string;
}

export interface BriefResult {
  summary: string;
  nextStep: string;
  talkingPoints: string[];
  risk: "low" | "medium" | "high";
  source: "ai" | "template";
}

const SYSTEM = `You are a sales strategist briefing a rep before they work a deal.
Be sharp and concrete. No fluff. Ground every statement in the supplied context — never invent facts.
Produce: a 1-2 sentence situation summary, the single best next step, 2-4 specific talking points, and a risk rating (low/medium/high) for losing the deal.
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
${languageDirective(input.language) ? `\n${languageDirective(input.language)}\n` : ""}
Brief the rep now.`;

  try {
    const out = await completeJson<Omit<BriefResult, "source">>({
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 1200,
      think: true,
      feature: "brief",
    });
    return { ...out, source: "ai" };
  } catch {
    return fallback(input);
  }
}
