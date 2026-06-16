import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ttsProvider, ttsAvailable, providerVoice, cartesiaVoice, elevenSettings, elevenModel, elevenModelChain, elevenModelUnavailable, openaiInstructions, ELEVEN_VOICES, OPENAI_VOICES, synthesizeSpeech } from "@/lib/voice/tts";
import { HOUSE_VOICES } from "@/lib/voice/house";

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
  "ELEVENLABS_MODEL",
  "ELEVENLABS_MODEL_HQ",
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

  it("ElevenLabs tops the ladder — the best voice wins when configured", () => {
    process.env.CARTESIA_API_KEY = "ca-x";
    process.env.CARTESIA_VOICE_ID = "uuid-1";
    expect(ttsProvider()).toBe("cartesia"); // fully-configured Cartesia answers…
    process.env.ELEVENLABS_API_KEY = "el-x";
    expect(ttsProvider()).toBe("elevenlabs"); // …until the premium voice exists
  });

  it("Cartesia needs BOTH key and voice id to be usable", () => {
    process.env.CARTESIA_API_KEY = "ca-x"; // key alone is not usable
    process.env.OPENAI_API_KEY = "sk-x";
    expect(ttsProvider()).toBe("openai");
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

  it("EVERY house voice resolves to a real, gender/accent-matched provider voice", () => {
    const OPENAI_VALID = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]);
    const elevenValues = new Set(Object.values(ELEVEN_VOICES));
    for (const v of HOUSE_VOICES) {
      // OpenAI: always a valid voice name (no 404 on a real call).
      expect(OPENAI_VALID.has(providerVoice("openai", v.id)), `${v.id} → openai`).toBe(true);
      // ElevenLabs: a real catalog id (either an exact map or the group default).
      expect(elevenValues.has(providerVoice("elevenlabs", v.id)), `${v.id} → elevenlabs`).toBe(true);
    }
  });

  it("an unmapped voice falls back within its own gender/accent group, never a mismatch", () => {
    // af_sky has no exact ElevenLabs map → a female-US default (af_heart/Rachel),
    // not a male or UK voice.
    expect(providerVoice("elevenlabs", "af_sky")).toBe(ELEVEN_VOICES.af_heart);
    expect(providerVoice("elevenlabs", "bm_lewis")).toBe(ELEVEN_VOICES.bm_george); // male UK → male UK
    expect(providerVoice("elevenlabs", "am_fenrir")).toBe(ELEVEN_VOICES.am_adam); // male US → male US
    expect(providerVoice("elevenlabs", "bf_alice")).toBe(ELEVEN_VOICES.bf_emma); // female UK → female UK
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

describe("ElevenLabs quality tier", () => {
  it("realtime uses the quality-first real-time model (Turbo v2.5)", () => {
    expect(elevenModel()).toBe("eleven_turbo_v2_5");
    expect(elevenModel("realtime")).toBe("eleven_turbo_v2_5");
  });

  it("max prefers the most expressive model (v3) but keeps a proven fallback", () => {
    expect(elevenModel("max")).toBe("eleven_v3"); // best candidate first
    expect(elevenModelChain("max")).toEqual(["eleven_v3", "eleven_multilingual_v2"]);
  });

  it("realtime is a single model (no retry budget on a live call)", () => {
    expect(elevenModelChain("realtime")).toEqual(["eleven_turbo_v2_5"]);
  });

  it("both tiers are env-overridable; pinning HQ forces a single max-tier model", () => {
    process.env.ELEVENLABS_MODEL = "eleven_turbo_v2_5";
    process.env.ELEVENLABS_MODEL_HQ = "eleven_multilingual_v2";
    expect(elevenModel("realtime")).toBe("eleven_turbo_v2_5");
    expect(elevenModelChain("max")).toEqual(["eleven_multilingual_v2"]); // pin → no v3 attempt
    delete process.env.ELEVENLABS_MODEL;
    delete process.env.ELEVENLABS_MODEL_HQ;
  });

  it("treats a model/validation 4xx as 'try the next model', but not auth/rate/transient", () => {
    for (const s of [400, 403, 404, 422]) expect(elevenModelUnavailable(s)).toBe(true);
    for (const s of [401, 429, 500, 502, 503]) expect(elevenModelUnavailable(s)).toBe(false);
    expect(elevenModelUnavailable(undefined)).toBe(false);
  });
});

describe("emotion shaping", () => {
  it("expressive emotions lower ElevenLabs stability; calm raises it", () => {
    expect(elevenSettings("energetic").stability).toBeLessThan(elevenSettings("neutral").stability);
    expect(elevenSettings("calm").stability).toBeGreaterThan(elevenSettings("neutral").stability);
    // Speaker boost stays on across every emotion — the fidelity floor.
    for (const e of ["energetic", "warm", "empathetic", "calm", "confident", "neutral"] as const) {
      expect(elevenSettings(e).use_speaker_boost).toBe(true);
    }
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
