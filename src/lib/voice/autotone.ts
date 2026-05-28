import type { ToneId } from "@/lib/tones";

/**
 * Auto-tone — pick the right voice for a draft from the deal's own signals, so a
 * rep never has to think about it. A deal that's gone cold wants a calm, low-
 * pressure touch; one sitting at proposal wants quiet confidence; a high-value
 * deal wants the consultative advisor. Pure and tested; resolves to a real tone
 * preset the draft engine already understands.
 */

export interface ToneSignals {
  daysSinceContact?: number;
  recallReason?: string;
  /** Stage label text (matched loosely for late-funnel cues). */
  stageLabel?: string;
  value?: number;
  /** Sentiment of their most recent reply, if known. */
  lastReplySentiment?: "frustrated" | "negative" | "neutral" | "positive" | "excited";
}

export interface AutoTone {
  tone: ToneId;
  reason: string;
}

const LATE_STAGE = /(proposal|offer|negotiat|under contract|\bcontract\b|quote|decision|closing|commit)/i;

/** Choose a tone from deal signals, with a human-readable reason. */
export function autoTone(s: ToneSignals): AutoTone {
  // How they last reacted trumps everything — meet them where they are.
  if (s.lastReplySentiment === "frustrated" || s.lastReplySentiment === "negative")
    return { tone: "reassuring", reason: "they cooled last time — take the pressure off" };
  if (s.lastReplySentiment === "excited")
    return { tone: "enthusiastic", reason: "they're keen — match the energy and move it forward" };

  // Re-engaging something cold or lost: gentle, low-pressure.
  if (s.recallReason === "lost_winnable" || (s.daysSinceContact ?? 0) >= 21)
    return { tone: "reassuring", reason: "it's gone quiet — re-open gently, make it easy to say not now" };

  // Late in the funnel: assume the next step with quiet confidence.
  if (s.stageLabel && LATE_STAGE.test(s.stageLabel))
    return { tone: "confident", reason: "late-stage — assume the next step and propose a specific one" };

  // Big deal: lead like an advisor.
  if ((s.value ?? 0) >= 50000)
    return { tone: "consultative", reason: "high-value — lead with insight, earn the reply" };

  // Mildly stale: warm but a touch direct.
  if ((s.daysSinceContact ?? 0) >= 7)
    return { tone: "direct", reason: "a bit stale — be brief and get to the point" };

  return { tone: "warm", reason: "healthy and active — keep it warm and personable" };
}
