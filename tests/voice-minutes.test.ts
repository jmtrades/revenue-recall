import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  voiceCostPerMinuteUsd,
  voiceGrossMarginPct,
  estimatedCallsForMinutes,
  estimatedDialsForMinutes,
  talkMinutesPerDial,
  recordCallMinutes,
  voiceMinutesMeter,
  isWithinVoiceMinutes,
  AVG_CALL_MINUTES,
} from "@/lib/billing/voice-minutes";
import { entitlements } from "@/lib/billing/entitlements";
import { usageSummary, _resetUsage } from "@/lib/ai/usage";

const SAVED = { ...process.env };
beforeEach(() => {
  _resetUsage();
  for (const k of Object.keys(process.env)) if (k.startsWith("VOICE_COST_")) delete process.env[k];
});
afterEach(() => {
  process.env = { ...SAVED };
});

describe("voice cost model — the margin math plans are priced on", () => {
  it("blends telephony + STT + LLM + the voice tier (Flash-led premium path)", () => {
    expect(voiceCostPerMinuteUsd("elevenlabs")).toBeCloseTo(0.085, 3);
    expect(voiceCostPerMinuteUsd("cartesia")).toBeCloseTo(0.065, 3);
    expect(voiceCostPerMinuteUsd("openai")).toBeCloseTo(0.04, 3);
    expect(voiceCostPerMinuteUsd(null)).toBeCloseTo(0.025, 3); // no vendor voice bill
  });

  it("env overrides reprice a component without a deploy", () => {
    process.env.VOICE_COST_TTS_ELEVENLABS_PER_MIN = "0.12"; // pinned turbo instead of flash
    expect(voiceCostPerMinuteUsd("elevenlabs")).toBeCloseTo(0.145, 3);
  });

  it("WORST-CASE voice margin floors hold at FULL allowance consumption (≥70% target)", () => {
    // Repriced for a ≥70% TOTAL-COGS floor: voice alone is now ~20% of price.
    // Operator: $599 / 1,500 min → voice COGS $127.50 (21%) → ~79% voice margin.
    expect(voiceGrossMarginPct(599, 1500, "elevenlabs")).toBeGreaterThan(0.75);
    // Autopilot: $1,699 / 4,000 min → voice COGS $340 (20%) → ~80% voice margin.
    expect(voiceGrossMarginPct(1699, 4000, "elevenlabs")).toBeGreaterThan(0.75);
    // Cartesia path widens both further.
    expect(voiceGrossMarginPct(599, 1500, "cartesia")).toBeGreaterThan(0.8);
    expect(voiceGrossMarginPct(1699, 4000, "cartesia")).toBeGreaterThan(0.8);
  });

  it("turns minutes into honest call-count copy", () => {
    expect(AVG_CALL_MINUTES).toBe(3);
    expect(estimatedCallsForMinutes(1500)).toBe(500);
    expect(estimatedCallsForMinutes(Infinity)).toBe(Infinity);
  });

  it("dial-mix model grounds the marketing claims in the priced math", () => {
    // 15% connects × 3 min + 38% voicemails × 0.5 min = 0.64 talk min / dial.
    expect(talkMinutesPerDial()).toBeCloseTo(0.64, 2);
    // Operator 1,500 min ≈ 2,300+ dials/mo — "covers ~100 dials a day".
    expect(estimatedDialsForMinutes(1500)).toBeGreaterThanOrEqual(2200);
    // Autopilot 4,000 min ≈ 6,000+ dials a month pooled.
    expect(estimatedDialsForMinutes(4000)).toBeGreaterThanOrEqual(6000);
    expect(estimatedDialsForMinutes(Infinity)).toBe(Infinity);
  });
});

describe("plan minute allowances", () => {
  it("free has no phone minutes; paid tiers carry rep-scale volume; enterprise unmetered", () => {
    expect(entitlements("free").voiceMinutesPerMonth).toBe(0);
    expect(entitlements("growth").voiceMinutesPerMonth).toBe(1500);
    expect(entitlements("team").voiceMinutesPerMonth).toBe(4000);
    expect(entitlements("scale").voiceMinutesPerMonth).toBe(Infinity);
  });
});

describe("minute top-up packs", () => {
  it("every minute pack clears ≥45% margin even at full premium-voice burn", async () => {
    const { topupPacksFor } = await import("@/lib/billing/topups");
    const packs = topupPacksFor("minutes");
    expect(packs.length).toBeGreaterThanOrEqual(3);
    const cogs = voiceCostPerMinuteUsd("elevenlabs"); // worst case: all premium
    for (const p of packs) {
      const perMin = p.suggestedUsd / p.actions;
      const margin = 1 - cogs / perMin;
      expect(margin, `${p.id} margin`).toBeGreaterThan(0.45);
    }
  });

  it("message and minute packs stay separate pools (unit discriminator)", async () => {
    const { TOPUP_PACKS, topupPacksFor } = await import("@/lib/billing/topups");
    expect(topupPacksFor("messages").length + topupPacksFor("minutes").length).toBe(TOPUP_PACKS.length);
    for (const p of topupPacksFor("minutes")) expect(p.id.startsWith("m")).toBe(true);
  });

  it("meter exposes the credit-stacked limit (in-memory: no credits → limit = included)", async () => {
    const m = await voiceMinutesMeter();
    expect(m.creditsMin).toBe(0);
    expect(m.limitMin).toBe(m.includedMin);
  });
});

describe("minutes metering (in-memory ledger path)", () => {
  it("records seconds + real COGS, and sums into the monthly meter", async () => {
    await recordCallMinutes(120, "elevenlabs"); // 2 min
    await recordCallMinutes(90, "elevenlabs"); // 1.5 min
    const meter = await voiceMinutesMeter();
    expect(meter.usedMin).toBeCloseTo(3.5, 1);
    // Demo org resolves to the free plan → 0 included → metered out.
    expect(meter.includedMin).toBe(0);
    expect(await isWithinVoiceMinutes()).toBe(false);
  });

  it("call-minute rows never burn the AI-message action pool", async () => {
    await recordCallMinutes(300, "elevenlabs");
    const s = await usageSummary();
    expect(s.actions).toBe(0); // not an AI message
    expect(s.costUsd).toBeGreaterThan(0); // but the COGS is visible to the operator
    expect(s.byFeature.call_minutes).toBeGreaterThan(0);
  });

  it("ignores zero/negative durations — a failed dial isn't a billable minute", async () => {
    await recordCallMinutes(0);
    await recordCallMinutes(-30);
    expect((await voiceMinutesMeter()).usedMin).toBe(0);
  });
});
