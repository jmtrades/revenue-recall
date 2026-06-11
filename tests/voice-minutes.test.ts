import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  voiceCostPerMinuteUsd,
  voiceGrossMarginPct,
  estimatedCallsForMinutes,
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
  it("blends telephony + STT + LLM + the voice tier", () => {
    expect(voiceCostPerMinuteUsd("elevenlabs")).toBeCloseTo(0.105, 3);
    expect(voiceCostPerMinuteUsd("cartesia")).toBeCloseTo(0.065, 3);
    expect(voiceCostPerMinuteUsd("openai")).toBeCloseTo(0.04, 3);
    expect(voiceCostPerMinuteUsd(null)).toBeCloseTo(0.025, 3); // no vendor voice bill
  });

  it("env overrides reprice a component without a deploy", () => {
    process.env.VOICE_COST_TTS_ELEVENLABS_PER_MIN = "0.06"; // negotiated rate
    expect(voiceCostPerMinuteUsd("elevenlabs")).toBeCloseTo(0.085, 3);
  });

  it("plan allowances keep voice COGS ≤ ~20% of price on the premium path", () => {
    // Operator: $299 / 500 min → ~82% gross margin on voice.
    expect(voiceGrossMarginPct(299, 500, "elevenlabs")).toBeGreaterThan(0.8);
    // Autopilot: $899 / 1,500 min → ~82.5%.
    expect(voiceGrossMarginPct(899, 1500, "elevenlabs")).toBeGreaterThan(0.8);
    // Cartesia path widens both past 89%.
    expect(voiceGrossMarginPct(299, 500, "cartesia")).toBeGreaterThan(0.89);
  });

  it("turns minutes into honest call-count copy", () => {
    expect(AVG_CALL_MINUTES).toBe(3);
    expect(estimatedCallsForMinutes(500)).toBe(166);
    expect(estimatedCallsForMinutes(1500)).toBe(500);
    expect(estimatedCallsForMinutes(Infinity)).toBe(Infinity);
  });
});

describe("plan minute allowances", () => {
  it("free has no phone minutes; paid tiers scale; enterprise unmetered", () => {
    expect(entitlements("free").voiceMinutesPerMonth).toBe(0);
    expect(entitlements("growth").voiceMinutesPerMonth).toBe(500);
    expect(entitlements("team").voiceMinutesPerMonth).toBe(1500);
    expect(entitlements("scale").voiceMinutesPerMonth).toBe(Infinity);
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
