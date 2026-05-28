import { completeJson, isAiConfigured } from "@/lib/ai/client";

export type CallOutcome = "connected" | "voicemail" | "no_answer" | "callback_scheduled" | "not_interested" | "meeting_booked";

export interface CallSummaryInput {
  contactName: string;
  dealTitle: string;
  notes: string;
}

export interface CallSummaryResult {
  summary: string;
  outcome: CallOutcome;
  sentiment: "positive" | "neutral" | "negative";
  nextStep: string;
  source: "ai" | "template";
}

const SYSTEM = `You are a sales call analyst. Given a rep's raw call notes, produce a clean CRM-ready summary.
Infer the outcome and sentiment strictly from the notes — do not invent details.
"outcome" must be one of: connected, voicemail, no_answer, callback_scheduled, not_interested, meeting_booked.
Keep "summary" to 1-2 sentences. "nextStep" is the single most useful follow-up action.
Return only the requested JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    outcome: { type: "string", enum: ["connected", "voicemail", "no_answer", "callback_scheduled", "not_interested", "meeting_booked"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    nextStep: { type: "string" },
  },
  required: ["summary", "outcome", "sentiment", "nextStep"],
};

function fallback(input: CallSummaryInput): CallSummaryResult {
  const n = input.notes.toLowerCase();
  const outcome: CallOutcome = n.includes("voicemail") || n.includes("vm")
    ? "voicemail"
    : n.includes("no answer") || n.includes("didn't pick") || n.includes("did not answer")
      ? "no_answer"
      : n.includes("meeting") || n.includes("booked") || n.includes("demo")
        ? "meeting_booked"
        : n.includes("not interested") || n.includes("no thanks") || n.includes("pass")
          ? "not_interested"
          : n.includes("call back") || n.includes("callback") || n.includes("follow up")
            ? "callback_scheduled"
            : "connected";
  const sentiment = n.includes("not interested") || n.includes("angry") || n.includes("frustrat")
    ? "negative"
    : n.includes("interested") || n.includes("great") || n.includes("excited") || outcome === "meeting_booked"
      ? "positive"
      : "neutral";
  const nextStep =
    outcome === "voicemail" || outcome === "no_answer"
      ? "Try again tomorrow at a different time; follow up with a text."
      : outcome === "meeting_booked"
        ? "Send calendar invite and a recap email."
        : outcome === "not_interested"
          ? "Mark lost with reason; add to a long-term nurture."
          : "Send a recap and propose a concrete next step.";
  return {
    summary: input.notes.trim().slice(0, 240) || `Call with ${input.contactName} about ${input.dealTitle}.`,
    outcome,
    sentiment,
    nextStep,
    source: "template",
  };
}

export async function summarizeCall(input: CallSummaryInput): Promise<CallSummaryResult> {
  if (!isAiConfigured() || !input.notes.trim()) return fallback(input);
  const user = `Contact: ${input.contactName}
Deal: "${input.dealTitle}"
Raw call notes:
${input.notes}

Summarize the call now.`;
  try {
    const out = await completeJson<Omit<CallSummaryResult, "source">>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 700, cache: true });
    return { ...out, source: "ai" };
  } catch {
    return fallback(input);
  }
}
