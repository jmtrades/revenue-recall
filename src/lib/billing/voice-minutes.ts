import { entitlements, effectivePlan } from "@/lib/billing/entitlements";
import { getSubscription } from "@/lib/billing/store";
import { recordUsage, featureUnitsThisMonth } from "@/lib/ai/usage";
import { ttsProvider, type TtsProvider } from "@/lib/voice/tts";

/**
 * Voice-minute economics — the COGS model for AI phone calls and the
 * customer-facing minutes meter. A connected call burns four meters at once
 * (telephony + speech-to-text + the premium voice + the model thinking up each
 * turn); this module is the one place that math lives, so plan pricing, the
 * in-product meter, and the operator's margin view can never drift apart.
 *
 * Planning rates (USD per connected minute, list-price assumptions — override
 * any of them via env when your negotiated rates differ):
 *   telephony  $0.014   (US outbound)
 *   STT        $0.006   (streaming transcription)
 *   LLM        $0.005   (~2 turns/min on a fast model)
 *   TTS        $0.080 ElevenLabs · $0.040 Cartesia · $0.015 OpenAI · $0 browser/none
 *
 * Blended: ~$0.105/min on ElevenLabs (the "best voice" path), ~$0.065 Cartesia,
 * ~$0.040 OpenAI. At the shipped allowances that prices voice COGS at ~18% of
 * plan revenue on the premium path (≈82% gross margin on voice) — see
 * voiceGrossMarginPct for the live math.
 */

const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export function telephonyUsdPerMin(): number {
  return num("VOICE_COST_TELEPHONY_PER_MIN", 0.014);
}
export function sttUsdPerMin(): number {
  return num("VOICE_COST_STT_PER_MIN", 0.006);
}
export function llmUsdPerMin(): number {
  return num("VOICE_COST_LLM_PER_MIN", 0.005);
}
export function ttsUsdPerMin(provider: TtsProvider | null): number {
  switch (provider) {
    case "elevenlabs":
      return num("VOICE_COST_TTS_ELEVENLABS_PER_MIN", 0.08);
    case "cartesia":
      return num("VOICE_COST_TTS_CARTESIA_PER_MIN", 0.04);
    case "openai":
      return num("VOICE_COST_TTS_OPENAI_PER_MIN", 0.015);
    default:
      return 0; // browser / in-house engine — no per-minute vendor bill
  }
}

/** Blended cost of one connected minute with the given (or configured) voice. */
export function voiceCostPerMinuteUsd(provider: TtsProvider | null = ttsProvider()): number {
  return Number((telephonyUsdPerMin() + sttUsdPerMin() + llmUsdPerMin() + ttsUsdPerMin(provider)).toFixed(4));
}

/** Gross margin (0–1) on a plan's voice allowance: what's left of the plan
 *  price after the included minutes' COGS at the given voice tier. */
export function voiceGrossMarginPct(planMonthlyUsd: number, includedMinutes: number, provider: TtsProvider | null = "elevenlabs"): number {
  if (planMonthlyUsd <= 0 || !Number.isFinite(includedMinutes)) return 0;
  const cogs = includedMinutes * voiceCostPerMinuteUsd(provider);
  return Number(Math.max(0, 1 - cogs / planMonthlyUsd).toFixed(4));
}

/** Planning average for "how many calls is that?" copy — a worked recall call
 *  (voicemails are far shorter, conversations longer; 3 min is the blend). */
export const AVG_CALL_MINUTES = 3;

export function estimatedCallsForMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? Math.floor(minutes / AVG_CALL_MINUTES) : Infinity;
}

// ---------------------------------------------------------------------------
// Metering — same ledger as AI actions (feature "call_minutes", units=seconds),
// so prod needs no migration and the month windows/org scoping are identical.
// ---------------------------------------------------------------------------

export const CALL_MINUTES_FEATURE = "call_minutes";

/** Record a finished call's connected time (and its real COGS). Best-effort —
 *  metering must never break the call-log path that feeds the timeline. */
export async function recordCallMinutes(durationSec: number, provider: TtsProvider | null = ttsProvider()): Promise<void> {
  const sec = Math.max(0, Math.round(durationSec));
  if (sec <= 0) return;
  await recordUsage({
    model: `voice:${provider ?? "none"}`,
    inputTokens: sec, // units column: SECONDS for this feature (see usage.ts)
    outputTokens: 0,
    costUsd: Number(((sec / 60) * voiceCostPerMinuteUsd(provider)).toFixed(4)),
    feature: CALL_MINUTES_FEATURE,
  });
}

export interface VoiceMinutesMeter {
  /** Connected minutes used this month (1 decimal). */
  usedMin: number;
  /** Plan's included monthly minutes (Infinity = unmetered). */
  includedMin: number;
  /** max(0, included − used). */
  remainingMin: number;
  /** used / included, clamped 0–1 (0 when unmetered). */
  fraction: number;
  unlimited: boolean;
}

/** The current org's voice meter — included minutes come from the EFFECTIVE
 *  plan (past_due/canceled → free), consistent with every other gate. */
export async function voiceMinutesMeter(now: Date = new Date()): Promise<VoiceMinutesMeter> {
  const [seconds, sub] = await Promise.all([featureUnitsThisMonth(CALL_MINUTES_FEATURE, now), getSubscription()]);
  const includedMin = entitlements(effectivePlan(sub.plan, sub.status)).voiceMinutesPerMonth;
  const unlimited = !Number.isFinite(includedMin);
  const usedMin = Number((seconds / 60).toFixed(1));
  const remainingMin = unlimited ? Infinity : Math.max(0, Number((includedMin - usedMin).toFixed(1)));
  const fraction = unlimited || includedMin <= 0 ? (unlimited ? 0 : 1) : Math.min(1, usedMin / includedMin);
  return { usedMin, includedMin, remainingMin, fraction, unlimited };
}

/** True while the org still has included call minutes this month (or is
 *  unmetered). Callers gate with this only when billing enforcement is on —
 *  open demos and self-hosted deploys stay unmetered. */
export async function isWithinVoiceMinutes(now: Date = new Date()): Promise<boolean> {
  const m = await voiceMinutesMeter(now);
  return m.unlimited || (m.includedMin > 0 && m.usedMin < m.includedMin);
}
