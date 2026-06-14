import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ELEVEN_PREFIX,
  elevenConfigured,
  elevenSelection,
  parseElevenSelection,
  describeVoice,
  normalizeElevenVoice,
  sortVoices,
  type ElevenVoice,
} from "@/lib/voice/eleven";
import { providerVoice, ELEVEN_VOICES, OPENAI_VOICES } from "@/lib/voice/tts";

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
});

describe("eleven selection encoding", () => {
  it("wraps and parses a raw voice id round-trip", () => {
    expect(elevenSelection("abc123")).toBe(`${ELEVEN_PREFIX}abc123`);
    expect(parseElevenSelection("eleven:abc123")).toBe("abc123");
  });

  it("rejects non-eleven values and malformed ids", () => {
    expect(parseElevenSelection("af_heart")).toBeNull(); // a house id, not eleven
    expect(parseElevenSelection("clone:rep_1")).toBeNull();
    expect(parseElevenSelection(null)).toBeNull();
    expect(parseElevenSelection(undefined)).toBeNull();
    expect(parseElevenSelection("eleven:")).toBeNull(); // empty id
    expect(parseElevenSelection("eleven:has space")).toBeNull();
    expect(parseElevenSelection("eleven:../etc")).toBeNull(); // path-y junk can't reach a URL
  });
});

describe("elevenConfigured", () => {
  it("is false without a key and true with one", () => {
    expect(elevenConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "el-x";
    expect(elevenConfigured()).toBe(true);
  });
});

describe("voice normalization", () => {
  it("builds a readable descriptor from labels", () => {
    expect(describeVoice({ labels: { gender: "female", accent: "american", age: "young" } })).toBe(
      "Female · American · Young",
    );
    expect(describeVoice({ category: "premade" })).toBe("Premade"); // no labels → category
  });

  it("normalizes a raw provider voice and flags clones", () => {
    const v = normalizeElevenVoice({ voice_id: "v1", name: "Sam", category: "cloned", labels: { gender: "male" } });
    expect(v).toMatchObject({ id: "v1", name: "Sam", cloned: true });
    expect(normalizeElevenVoice({ name: "no id" })).toBeNull(); // unusable without an id
    expect(normalizeElevenVoice({ voice_id: "v2", category: "premade" })?.cloned).toBe(false);
  });

  it("sorts the org's clones ahead of stock voices, then alphabetically", () => {
    const voices: ElevenVoice[] = [
      { id: "3", name: "Zed", category: "premade", description: "", cloned: false },
      { id: "1", name: "Bea", category: "premade", description: "", cloned: false },
      { id: "2", name: "Mine", category: "cloned", description: "", cloned: true },
    ];
    expect(sortVoices(voices).map((v) => v.id)).toEqual(["2", "1", "3"]);
  });
});

describe("providerVoice — eleven selection passthrough", () => {
  it("passes an eleven:<id> straight through on ElevenLabs (incl. clones)", () => {
    expect(providerVoice("elevenlabs", "eleven:realVoiceId")).toBe("realVoiceId");
  });

  it("falls back to the provider default for non-ElevenLabs backends", () => {
    // Other providers can't speak an ElevenLabs voice id → their default voice.
    expect(providerVoice("openai", "eleven:realVoiceId")).toBe(OPENAI_VOICES.af_heart);
  });

  it("leaves house-voice mapping untouched", () => {
    expect(providerVoice("elevenlabs", "am_adam")).toBe(ELEVEN_VOICES.am_adam);
  });
});
