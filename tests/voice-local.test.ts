import { describe, it, expect } from "vitest";
import { resolveLocalVoice, localSpeed, localVoiceState, localSynth } from "@/lib/voice/local";
import { HOUSE_VOICES, DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

describe("on-device Kokoro voice resolution", () => {
  it("passes every house voice id straight through (they ARE Kokoro ids)", () => {
    for (const v of HOUSE_VOICES) expect(resolveLocalVoice(v.id)).toBe(v.id);
  });

  it("clone voices and unknowns fall back to the default", () => {
    expect(resolveLocalVoice("clone:rep_42")).toBe(DEFAULT_HOUSE_VOICE);
    expect(resolveLocalVoice("not_a_voice")).toBe(DEFAULT_HOUSE_VOICE);
    expect(resolveLocalVoice(undefined)).toBe(DEFAULT_HOUSE_VOICE);
  });
});

describe("on-device speaking speed", () => {
  it("folds the emotional profile into the rate and clamps to the model's range", () => {
    expect(localSpeed(1, "neutral")).toBe(1);
    expect(localSpeed(1, "energetic")).toBeGreaterThan(1);
    expect(localSpeed(1, "empathetic")).toBeLessThan(1);
    expect(localSpeed(3, "energetic")).toBe(1.5); // clamped high
    expect(localSpeed(0.1, "calm")).toBe(0.5); // clamped low
  });
});

describe("availability in a non-browser environment", () => {
  it("is idle and unavailable in node — callers keep their fallback", () => {
    expect(localVoiceState()).toBe("idle");
    expect(localSynth.available()).toBe(false);
  });
});

describe("ensureLocalVoice / progress in a non-browser env", () => {
  it("resolves false (can't run) without throwing, and progress stays 0", async () => {
    const { ensureLocalVoice, localVoiceProgress } = await import("@/lib/voice/local");
    await expect(ensureLocalVoice()).resolves.toBe(false);
    expect(localVoiceProgress()).toBe(0);
  });
});
