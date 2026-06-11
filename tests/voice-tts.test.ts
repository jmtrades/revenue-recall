import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ttsProvider, ttsAvailable, providerVoice, elevenSettings, openaiInstructions, ELEVEN_VOICES, OPENAI_VOICES, synthesizeSpeech } from "@/lib/voice/tts";

const CLEAR = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "OPENAI_TTS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_TTS_VOICE"];

beforeEach(() => {
  for (const k of CLEAR) delete process.env[k];
});
afterEach(() => {
  for (const k of CLEAR) delete process.env[k];
});

describe("hosted TTS provider chain", () => {
  it("reports unavailable with no keys (browser voice keeps working)", () => {
    expect(ttsProvider()).toBeNull();
    expect(ttsAvailable()).toBe(false);
  });

  it("prefers ElevenLabs over OpenAI when both are set", () => {
    process.env.OPENAI_API_KEY = "sk-x";
    expect(ttsProvider()).toBe("openai");
    process.env.ELEVENLABS_API_KEY = "el-x";
    expect(ttsProvider()).toBe("elevenlabs");
  });

  it("synthesizeSpeech throws cleanly with no provider", async () => {
    await expect(synthesizeSpeech({ text: "hi" })).rejects.toThrow(/No hosted TTS provider/);
  });
});

describe("house voice → provider voice mapping", () => {
  it("maps every house voice on both providers", () => {
    for (const id of Object.keys(ELEVEN_VOICES)) {
      expect(providerVoice("elevenlabs", id)).toBe(ELEVEN_VOICES[id]);
      expect(providerVoice("openai", id)).toBe(OPENAI_VOICES[id]);
    }
  });

  it("clone voices and unknown ids fall back to the default voice", () => {
    expect(providerVoice("elevenlabs", "clone:abc123")).toBe(ELEVEN_VOICES.af_heart);
    expect(providerVoice("openai", "not_a_voice")).toBe(OPENAI_VOICES.af_heart);
    expect(providerVoice("openai", null)).toBe(OPENAI_VOICES.af_heart);
  });

  it("an env default override wins only for the default voice", () => {
    process.env.ELEVENLABS_VOICE_ID = "custom_el";
    expect(providerVoice("elevenlabs", undefined)).toBe("custom_el");
    expect(providerVoice("elevenlabs", "am_adam")).toBe(ELEVEN_VOICES.am_adam);
  });
});

describe("emotion shaping", () => {
  it("expressive emotions lower ElevenLabs stability; calm raises it", () => {
    expect(elevenSettings("energetic").stability).toBeLessThan(elevenSettings("neutral").stability);
    expect(elevenSettings("calm").stability).toBeGreaterThan(elevenSettings("neutral").stability);
  });

  it("OpenAI instructions always demand a natural human delivery and reflect the emotion", () => {
    for (const e of ["neutral", "warm", "calm", "energetic", "empathetic", "confident"] as const) {
      const i = openaiInstructions(e);
      expect(i).toMatch(/natural and human/);
    }
    expect(openaiInstructions("empathetic")).toMatch(/Gentle/);
    expect(openaiInstructions("energetic")).toMatch(/Upbeat/);
  });
});
