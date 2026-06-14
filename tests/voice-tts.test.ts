import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ttsProvider, ttsAvailable, providerVoice, cartesiaVoice, elevenVoice, elevenSettings, elevenModel, elevenOutputFormat, elevenMime, openaiInstructions, ELEVEN_VOICES, OPENAI_VOICES, synthesizeSpeech, listElevenVoices } from "@/lib/voice/tts";
import { HOUSE_VOICES } from "@/lib/voice/house";
import { vi } from "vitest";

const CLEAR = [
  "ELEVENLABS_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_TTS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_VOICE_MAP",
  "OPENAI_TTS_VOICE",
  "CARTESIA_API_KEY",
  "CARTESIA_VOICE_ID",
  "CARTESIA_VOICE_MAP",
  "VOICE_TTS_PROVIDER",
  "ELEVENLABS_MODEL",
  "ELEVENLABS_MODEL_HQ",
  "ELEVENLABS_OUTPUT_FORMAT",
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

  it("the curated catalog now gives previously-collapsing voices a DISTINCT premium voice", () => {
    // Before: these fell back to their group default. Now each maps to its own
    // hand-matched ElevenLabs voice (the point of this change).
    expect(providerVoice("elevenlabs", "af_sky")).toBe(ELEVEN_VOICES.af_sky);
    expect(providerVoice("elevenlabs", "af_sky")).not.toBe(ELEVEN_VOICES.af_heart);
    expect(providerVoice("elevenlabs", "am_fenrir")).toBe(ELEVEN_VOICES.am_fenrir);
    expect(providerVoice("elevenlabs", "am_fenrir")).not.toBe(ELEVEN_VOICES.am_adam);
    expect(providerVoice("elevenlabs", "bf_lily")).toBe(ELEVEN_VOICES.bf_lily);
    expect(providerVoice("elevenlabs", "bf_lily")).not.toBe(ELEVEN_VOICES.bf_emma);
  });

  it("the few voices without a distinct premade match fall back within their own group", () => {
    // bm_lewis / bm_fable have no exact premade → a male-UK default (George),
    // never a mismatch. (Operators can give them their own via ELEVENLABS_VOICE_MAP.)
    expect(providerVoice("elevenlabs", "bm_lewis")).toBe(ELEVEN_VOICES.bm_george);
    expect(providerVoice("elevenlabs", "bm_fable")).toBe(ELEVEN_VOICES.bm_george);
  });

  it("ELEVENLABS_VOICE_MAP overrides the built-in catalog (curate any voice, incl. clones, with no deploy)", () => {
    process.env.ELEVENLABS_VOICE_MAP = JSON.stringify({ af_heart: "my-best-voice", bm_lewis: "my-uk-clone" });
    expect(elevenVoice("af_heart")).toBe("my-best-voice"); // overrides Rachel
    expect(elevenVoice("bm_lewis")).toBe("my-uk-clone"); // fills a group-default gap
    expect(elevenVoice("am_adam")).toBe(ELEVEN_VOICES.am_adam); // unmapped → built-in catalog
  });

  it("a malformed ELEVENLABS_VOICE_MAP falls back to the catalog instead of throwing", () => {
    process.env.ELEVENLABS_VOICE_MAP = "{not json";
    expect(elevenVoice("af_heart")).toBe(ELEVEN_VOICES.af_heart);
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
  it("realtime uses the low-latency Flash model the call margins are priced on", () => {
    expect(elevenModel()).toBe("eleven_flash_v2_5");
    expect(elevenModel("realtime")).toBe("eleven_flash_v2_5");
  });

  it("max uses the highest-quality production model for non-realtime audio", () => {
    expect(elevenModel("max")).toBe("eleven_multilingual_v2");
  });

  it("both tiers are env-overridable, independently", () => {
    process.env.ELEVENLABS_MODEL = "eleven_turbo_v2_5";
    process.env.ELEVENLABS_MODEL_HQ = "eleven_v3";
    expect(elevenModel("realtime")).toBe("eleven_turbo_v2_5");
    expect(elevenModel("max")).toBe("eleven_v3");
    delete process.env.ELEVENLABS_MODEL;
    delete process.env.ELEVENLABS_MODEL_HQ;
  });

  it("max quality requests the highest-fidelity browser-playable format; realtime stays 128k", () => {
    expect(elevenOutputFormat("max")).toBe("mp3_44100_192");
    expect(elevenOutputFormat("realtime")).toBe("mp3_44100_128");
    expect(elevenOutputFormat()).toBe("mp3_44100_128");
  });

  it("the max format is env-overridable (free-tier downgrade or lossless)", () => {
    process.env.ELEVENLABS_OUTPUT_FORMAT = "pcm_44100";
    expect(elevenOutputFormat("max")).toBe("pcm_44100");
    expect(elevenOutputFormat("realtime")).toBe("mp3_44100_128"); // realtime unaffected
  });

  it("MIME follows the format token", () => {
    expect(elevenMime("mp3_44100_192")).toBe("audio/mpeg");
    expect(elevenMime("pcm_44100")).toBe("audio/L16");
    expect(elevenMime("wav_44100")).toBe("audio/wav");
    expect(elevenMime("ulaw_8000")).toBe("audio/basic");
  });
});

describe("listElevenVoices (discovery for ELEVENLABS_VOICE_MAP)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns [] when ElevenLabs isn't configured (never calls out)", async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await listElevenVoices()).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps the account's voices (premade + cloned), dropping malformed entries", async () => {
    process.env.ELEVENLABS_API_KEY = "el-x";
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          voices: [
            { voice_id: "v1", name: "Rachel", category: "premade", labels: { accent: "american", gender: "female" }, preview_url: "http://x/p" },
            { voice_id: "v2", name: "My Clone", category: "cloned" },
            { name: "no id — dropped" },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const voices = await listElevenVoices();
    expect(voices).toHaveLength(2);
    expect(voices[0]).toMatchObject({ id: "v1", name: "Rachel", category: "premade", labels: { gender: "female" }, previewUrl: "http://x/p" });
    expect(voices[1]).toMatchObject({ id: "v2", name: "My Clone", category: "cloned" });
  });

  it("returns [] on a non-OK response or a network error — never throws", async () => {
    process.env.ELEVENLABS_API_KEY = "el-x";
    global.fetch = vi.fn(async () => new Response("nope", { status: 401 })) as typeof fetch;
    expect(await listElevenVoices()).toEqual([]);
    global.fetch = vi.fn(async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    expect(await listElevenVoices()).toEqual([]);
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
