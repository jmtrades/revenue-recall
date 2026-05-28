import { describe, it, expect } from "vitest";
import { thinkingPauseMs, shouldBargeIn, pickBackchannel, wordCount, END_OF_TURN_SILENCE_MS } from "@/lib/voice/turntaking";

describe("turn-taking timing", () => {
  it("gives more room when the moment is tense, less when it's upbeat", () => {
    expect(thinkingPauseMs("frustrated")).toBeGreaterThan(thinkingPauseMs("neutral"));
    expect(thinkingPauseMs("excited")).toBeLessThan(thinkingPauseMs("neutral"));
    for (const s of ["frustrated", "negative", "neutral", "positive", "excited"] as const) {
      expect(thinkingPauseMs(s)).toBeGreaterThan(0);
      expect(thinkingPauseMs(s)).toBeLessThan(2000);
    }
    expect(END_OF_TURN_SILENCE_MS).toBeGreaterThan(0);
  });

  it("barges in only when actually speaking and real words were heard", () => {
    expect(shouldBargeIn(true, 3)).toBe(true);
    expect(shouldBargeIn(true, 1)).toBe(false); // a stray sound shouldn't cut a sentence
    expect(shouldBargeIn(false, 5)).toBe(false); // nothing to interrupt
  });

  it("backchannels occasionally and deterministically, never on the first turn", () => {
    expect(pickBackchannel("call1", 0)).toBeNull();
    expect(pickBackchannel("call1", 1)).toBeNull();
    const at3 = pickBackchannel("call1", 3);
    expect(at3).not.toBeNull();
    expect(pickBackchannel("call1", 3)).toBe(at3); // deterministic
  });

  it("counts words in interim transcripts", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("not interested thanks")).toBe(3);
  });
});
