import { describe, it, expect } from "vitest";
import { detectSentiment, reactTo, reactToText, sentimentToEmotion } from "@/lib/voice/reactive";
import { EMOTIONS, emotionProfile } from "@/lib/voice/speech";

describe("sentiment detection", () => {
  const cases: [string, ReturnType<typeof detectSentiment>][] = [
    ["honestly this is a waste of my time", "frustrated"],
    ["stop calling me, seriously", "frustrated"],
    ["I love this, let's do it!", "excited"],
    ["not interested, too expensive", "negative"],
    ["sure, that works, tell me more", "positive"],
    ["it's at the proposal stage", "neutral"],
  ];
  it("reads the mood from the line", () => {
    for (const [text, mood] of cases) expect(detectSentiment(text), text).toBe(mood);
  });
});

describe("reactive policy", () => {
  it("mood overrides topic: frustration → empathetic + reassuring", () => {
    const r = reactTo("price", "frustrated");
    expect(r.emotion).toBe("empathetic");
    expect(r.tone).toBe("reassuring");
    expect(r.note.length).toBeGreaterThan(0);
  });

  it("excitement → energetic + enthusiastic, drive to a step", () => {
    const r = reactTo("question", "excited");
    expect(r.emotion).toBe("energetic");
    expect(r.tone).toBe("enthusiastic");
  });

  it("calm, low-pressure handling for declines and timing", () => {
    expect(reactTo("decline", "negative").emotion).toBe("calm");
    expect(reactTo("timing", "neutral").tone).toBe("reassuring");
  });

  it("price objection (neutral) stays confident and consultative", () => {
    const r = reactTo("price", "neutral");
    expect(r.tone).toBe("consultative");
    expect(r.emotion).toBe("confident");
  });

  it("reactToText wires detection + policy together", () => {
    const r = reactToText("we already went with someone else");
    expect(r.tone).toBe("consultative");
  });

  it("maps a speaker's own mood to how they sound", () => {
    expect(sentimentToEmotion("excited")).toBe("energetic");
    expect(sentimentToEmotion("positive")).toBe("warm");
    expect(sentimentToEmotion("neutral")).toBe("neutral");
  });
});

describe("emotion prosody profiles", () => {
  it("calm/empathetic slow down and lengthen pauses; energetic speeds up", () => {
    expect(emotionProfile("calm").rateMul).toBeLessThan(1);
    expect(emotionProfile("empathetic").pauseMul).toBeGreaterThan(1);
    expect(emotionProfile("energetic").rateMul).toBeGreaterThan(1);
    expect(emotionProfile("energetic").pauseMul).toBeLessThan(1);
    expect(emotionProfile(undefined)).toEqual(EMOTIONS.neutral);
  });

  it("every emotion stays within sane multiplier bounds", () => {
    for (const p of Object.values(EMOTIONS)) {
      expect(p.rateMul).toBeGreaterThanOrEqual(0.8);
      expect(p.rateMul).toBeLessThanOrEqual(1.2);
      expect(p.pitchMul).toBeGreaterThanOrEqual(0.9);
      expect(p.pitchMul).toBeLessThanOrEqual(1.1);
    }
  });
});
