import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ELEVEN_PREFIX,
  elevenConfigured,
  elevenSelection,
  parseElevenSelection,
  describeVoice,
  normalizeElevenVoice,
  sortVoices,
  describeSharedVoice,
  normalizeSharedVoice,
  elevenErrorDetail,
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

describe("shared (public library) voice normalization", () => {
  it("builds a descriptor from the flat shared fields (not a labels object)", () => {
    expect(describeSharedVoice({ gender: "female", accent: "british", age: "middle_aged" })).toBe(
      "Female · British · Middle aged",
    );
    expect(describeSharedVoice({ category: "professional" })).toBe("Professional");
  });

  it("normalizes a shared voice, requiring both a voice id and a public owner id", () => {
    const v = normalizeSharedVoice({
      voice_id: "v1",
      public_owner_id: "owner1",
      name: "Aria",
      gender: "female",
      accent: "american",
      usage_character_count_1y: 5000,
      preview_url: "https://x/a.mp3",
    });
    expect(v).toMatchObject({ id: "v1", publicOwnerId: "owner1", name: "Aria", usage: 5000, previewUrl: "https://x/a.mp3" });
    // Both ids are mandatory to be addable.
    expect(normalizeSharedVoice({ voice_id: "v1" })).toBeNull();
    expect(normalizeSharedVoice({ public_owner_id: "owner1" })).toBeNull();
  });

  it("falls back to cloned_by_count for usage and 0 when neither is present", () => {
    expect(normalizeSharedVoice({ voice_id: "v", public_owner_id: "o", cloned_by_count: 12 })?.usage).toBe(12);
    expect(normalizeSharedVoice({ voice_id: "v", public_owner_id: "o" })?.usage).toBe(0);
  });

  it("keeps a real character usage of 0 instead of falling through to clone count", () => {
    // A `||` chain would discard the legit 0 and return 50, mixing units.
    expect(
      normalizeSharedVoice({ voice_id: "v", public_owner_id: "o", usage_character_count_1y: 0, cloned_by_count: 50 })?.usage,
    ).toBe(0);
  });
});

describe("elevenErrorDetail — surfaces the provider's real failure reason", () => {
  it("appends the truncated response body so a failure is diagnosable", async () => {
    expect(await elevenErrorDetail(new Response("invalid_api_key", { status: 401 }))).toBe(": invalid_api_key");
    expect(await elevenErrorDetail(new Response("a".repeat(500), { status: 422 }))).toBe(`: ${"a".repeat(200)}`);
  });

  it("returns an empty string when there's no body (never a dangling colon)", async () => {
    expect(await elevenErrorDetail(new Response("", { status: 500 }))).toBe("");
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
