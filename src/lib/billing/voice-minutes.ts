import { entitlements, effectivePlan } from "@/lib/billing/entitlements";
import { getSubscription } from "@/lib/billing/store";
import { recordUsage, featureUnitsThisMonth, voiceMinuteCreditsThisPeriod } from "@/lib/ai/usage";
import { ttsProvider, type TtsProvider } from "@/lib/voice/tts";

/**
 * Voice-minute economics — the COGS model for AI phone calls and the
 * customer-facing minutes meter. A connected call burns four meters at once
 * (telephony + speech-to-text + the premium voice + the model thinking up each
 * turn); this module is the one place that math lives, so plan pricing, the
 * in-product meter, and the operator's margin view can never drift apart.
 *
 * THE UNIT IS A CONNECTED TALK MINUTE, NOT A DIAL. Most dials cost ~nothing:
 * a no-answer is free (telephony bills answered calls) and a voicemail drop is
 * ~30 s — so "rep-scale dialing" (100+ dials/day) consumes far fewer paid
 * minutes than it sounds: 100 dials ≈ 15 connects × 3 min + 38 voicemails ×
 * 0.5 min ≈ 64 talk min. That's what lets the plans sell daily-dial volume
 * a real rep recognizes while voice COGS stays ≤ ~35% of price at FULL
 * consumption (typical utilization runs well under full).
 *
 * Planning rates (USD per connected minute, list-price assumptions — override
 * any of them via env when your negotiated rates differ):
 *   telephony  $0.014   (US outbound, answered time only)
 *   STT        $0.006   (streaming transcription)
 *   LLM        $0.005   (~2 turns/min on a fast model)
 *   TTS        $0.060 ElevenLabs Turbo v2.5 (the shipped call default — see tts.ts;
 *              Turbo v2.5 and Flash v2.5 are both 0.5 credits/char, so same rate)
 *              $0.040 Cartesia · $0.015 OpenAI · $0 browser/none
 *
 * Blended: ~$0.085/min on ElevenLabs (Turbo/Flash v2.5), ~$0.065 Cartesia, ~$0.040 OpenAI.
 * Worst-case (full-allowance) margins at the shipped prices — designed so TOTAL
 * COGS (voice + AI + Stripe + infra) stays ≤30% of price, i.e. ≥70% gross margin
 * even at FULL consumption (and far higher at real utilization):
 *   Operator  $599 / 1,500 min → voice COGS $127.50 = 21% of price
 *   Autopilot $1,699 / 4,000 min → voice COGS $340 = 20% of price
 * AI is the other COGS lever (~$0.018/msg blended, cold→Sonnet); included message
 * pools (1,500 / 6,000) are sized to keep the combined full-burn COGS under 30%.
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
      // Turbo v2.5 (the shipped call default in voice/tts.ts), billed at the same
      // 0.5 credits/char as Flash v2.5 — so $0.06/min holds. (eleven_v3 is the
      // read-aloud-only model and never used on a live call.)
      return num("VOICE_COST_TTS_ELEVENLABS_PER_MIN", 0.06);
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

// ---- dial-mix model: what a DIAL costs in talk minutes -----------------------
// Real outbound mix at rep scale. These feed the marketing claims ("covers
// ~100 dials a day") so the copy is derived from the same model the margins
// are — change the mix here and the tests force the claims to follow.
export const DIAL_CONNECT_RATE = 0.15; // answered, becomes a conversation
export const DIAL_VOICEMAIL_RATE = 0.38; // answered by machine, ~30 s drop
export const VOICEMAIL_MINUTES = 0.5;

/** Average talk minutes one dial consumes (no-answers are free). */
export function talkMinutesPerDial(): number {
  return Number((DIAL_CONNECT_RATE * AVG_CALL_MINUTES + DIAL_VOICEMAIL_RATE * VOICEMAIL_MINUTES).toFixed(3));
}

/** How many dials a minute allowance realistically covers. */
export function estimatedDialsForMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? Math.floor(minutes / talkMinutesPerDial()) : Infinity;
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
  /** Purchased top-up minutes active this month. */
  creditsMin: number;
  /** included + credits (Infinity = unmetered). */
  limitMin: number;
  /** max(0, limit − used). */
  remainingMin: number;
  /** used / limit, clamped 0–1 (0 when unmetered). */
  fraction: number;
  unlimited: boolean;
}

/** The current org's voice meter — included minutes come from the EFFECTIVE
 *  plan (past_due/canceled → free), consistent with every other gate; minute
 *  top-ups stack onto the month exactly like message top-ups do. */
export async function voiceMinutesMeter(now: Date = new Date()): Promise<VoiceMinutesMeter> {
  const [seconds, credits, sub] = await Promise.all([
    featureUnitsThisMonth(CALL_MINUTES_FEATURE, now),
    voiceMinuteCreditsThisPeriod(now),
    getSubscription(),
  ]);
  const includedMin = entitlements(effectivePlan(sub.plan, sub.status)).voiceMinutesPerMonth;
  const unlimited = !Number.isFinite(includedMin);
  const usedMin = Number((seconds / 60).toFixed(1));
  const creditsMin = unlimited ? 0 : credits;
  const limitMin = unlimited ? Infinity : includedMin + creditsMin;
  const remainingMin = unlimited ? Infinity : Math.max(0, Number((limitMin - usedMin).toFixed(1)));
  const fraction = unlimited || limitMin <= 0 ? (unlimited ? 0 : 1) : Math.min(1, usedMin / limitMin);
  return { usedMin, includedMin, creditsMin, limitMin, remainingMin, fraction, unlimited };
}

/** True while the org still has call minutes this month — plan allowance plus
 *  purchased top-ups (or is unmetered). Callers gate with this only when
 *  billing enforcement is on — open demos and self-hosted stay unmetered. */
export async function isWithinVoiceMinutes(now: Date = new Date()): Promise<boolean> {
  const m = await voiceMinutesMeter(now);
  return m.unlimited || (m.limitMin > 0 && m.usedMin < m.limitMin);
}
