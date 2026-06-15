import { describe, it, expect } from "vitest";
import { mergeVoiceSettings, expressivenessToStability, DEFAULT_VOICE_SETTINGS } from "@/lib/voice/voice-settings";
import { elevenSettings } from "@/lib/voice/tts";

describe("voice settings — merge + clamp", () => {
  it("defaults a blank/garbage value", () => {
    expect(mergeVoiceSettings(null)).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(mergeVoiceSettings({})).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(mergeVoiceSettings("nope")).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("clamps rate to the sane sales-call range", () => {
    expect(mergeVoiceSettings({ rate: 5 }).rate).toBe(1.2);
    expect(mergeVoiceSettings({ rate: 0.1 }).rate).toBe(0.7);
    expect(mergeVoiceSettings({ rate: 0.95 }).rate).toBe(0.95);
  });

  it("clamps expressiveness to 0–1", () => {
    expect(mergeVoiceSettings({ expressiveness: 9 }).expressiveness).toBe(1);
    expect(mergeVoiceSettings({ expressiveness: -2 }).expressiveness).toBe(0);
    expect(mergeVoiceSettings({ expressiveness: 0.3 }).expressiveness).toBe(0.3);
  });
});

describe("expressiveness → ElevenLabs stability", () => {
  it("inverts within safe bounds (flat = stable, lively = less stable)", () => {
    expect(expressivenessToStability(0)).toBe(0.8); // measured
    expect(expressivenessToStability(1)).toBe(0.3); // lively
    expect(expressivenessToStability(0.5)).toBe(0.55);
    // never hits the unstable extreme
    expect(expressivenessToStability(1)).toBeGreaterThanOrEqual(0.3);
  });
});

describe("elevenSettings — expressiveness override", () => {
  it("an explicit expressiveness overrides the per-emotion stability", () => {
    const base = elevenSettings("calm"); // calm → high stability by default
    const lively = elevenSettings("calm", 1); // override → lively
    expect(lively.stability).toBe(0.3);
    expect(lively.stability).toBeLessThan(base.stability);
    expect(lively.use_speaker_boost).toBe(true);
  });

  it("falls back to per-emotion shaping when no override is given", () => {
    expect(elevenSettings("energetic").stability).toBeLessThan(elevenSettings("calm").stability);
  });
});
