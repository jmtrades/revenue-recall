import { describe, it, expect } from "vitest";
import { isCallVoiceId, houseVoiceLabel, HOUSE_VOICES, DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

describe("house voices", () => {
  it("accepts known house ids and well-formed clone ids", () => {
    expect(isCallVoiceId("af_heart")).toBe(true);
    expect(isCallVoiceId("am_adam")).toBe(true);
    expect(isCallVoiceId("clone:rep_42")).toBe(true);
  });

  it("rejects unknown or malformed ids", () => {
    expect(isCallVoiceId("nonsense")).toBe(false);
    expect(isCallVoiceId("clone:")).toBe(false);
    expect(isCallVoiceId("clone:bad id!")).toBe(false);
    expect(isCallVoiceId("")).toBe(false);
    expect(isCallVoiceId("x".repeat(200))).toBe(false);
  });

  it("exposes a default that is itself a real house voice", () => {
    expect(HOUSE_VOICES.some((v) => v.id === DEFAULT_HOUSE_VOICE)).toBe(true);
  });

  it("labels house, clone, and default voices", () => {
    expect(houseVoiceLabel("af_bella")).toBe("Bella");
    expect(houseVoiceLabel("clone:abc")).toContain("Cloned");
    expect(houseVoiceLabel(null)).toContain("default");
  });
});
