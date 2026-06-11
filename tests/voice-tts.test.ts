import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ttsProvider, ttsAvailable, providerVoice, cartesiaVoice, elevenSettings, openaiInstructions, ELEVEN_VOICES, OPENAI_VOICES, synthesizeSpeech } from "@/lib/voice/tts";

const CLEAR = [
  "ELEVENLABS_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_TTS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "OPENAI_TTS_VOICE",
  "CARTESIA_API_KEY",
  "CARTESIA_VOICE_ID",
  "CARTESIA_VOICE_MAP",
  "VOICE_TTS_PROVIDER",
];

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

  it("Cartesia tops the ladder, but only with BOTH key and voice id", () => {
    process.env.ELEVENLABS_API_KEY = "el-x";
    process.env.CARTESIA_API_KEY = "ca-x"; // key alone is not usable
    expect(ttsProvider()).toBe("elevenlabs");
    process.env.CARTESIA_VOICE_ID = "uuid-1";
    expect(ttsProvider()).toBe("cartesia");
  });

  it("VOICE_TTS_PROVIDER pins a provider — but only if it's configured", () => {
    process.env.CARTESIA_API_KEY = "ca-x";
    process.env.CARTESIA_VOICE_ID = "uuid-1";
    process.env.OPENAI_API_KEY = "sk-x";
    process.env.VOICE_TTS_PROVIDER = "openai";
    expect(ttsProvider()).toBe("openai"); // pin honored
    process.env.VOICE_TTS_PROVIDER = "elevenlabs"; // pinned but NOT configured
    expect(ttsProvider()).toBe("cartesia"); // falls back to the ladder
  });
});

describe("Cartesia voice resolution", () => {
  it("uses the per-house map when present, default id otherwise", () => {
    process.env.CARTESIA_VOICE_ID = "default-uuid";
    expect(cartesiaVoice("af_heart")).toBe("default-uuid");
    process.env.CARTESIA_VOICE_MAP = JSON.stringify({ af_heart: "aria-uuid" });
    expect(cartesiaVoice("af_heart")).toBe("aria-uuid");
    expect(cartesiaVoice("am_adam")).toBe("default-uuid"); // unmapped → default
    expect(cartesiaVoice("clone:rep_1")).toBe("default-uuid"); // clones → default
  });

  it("a malformed map falls back to the default id instead of throwing", () => {
    process.env.CARTESIA_VOICE_ID = "default-uuid";
    process.env.CARTESIA_VOICE_MAP = "{not json";
    expect(cartesiaVoice("af_heart")).toBe("default-uuid");
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
