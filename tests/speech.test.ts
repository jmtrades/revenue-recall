import { describe, it, expect } from "vitest";
import { humanizeChunks, pickVoice, isSpeechSupported, isRecognitionSupported } from "@/lib/voice/speech";

// A minimal stand-in for SpeechSynthesisVoice (only the fields pickVoice reads).
function voice(name: string, lang = "en-US", localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("speech support guards (no DOM in node)", () => {
  it("reports unsupported in a non-browser env without throwing", () => {
    expect(isSpeechSupported()).toBe(false);
    expect(isRecognitionSupported()).toBe(false);
  });
});

describe("pickVoice", () => {
  it("returns null for an empty list", () => {
    expect(pickVoice([])).toBeNull();
  });

  it("honors an explicit preferred name", () => {
    const voices = [voice("Daniel"), voice("Samantha"), voice("Alex")];
    expect(pickVoice(voices, { preferName: "alex" })?.name).toBe("Alex");
  });

  it("prefers a natural-sounding family when no name is given", () => {
    const voices = [voice("Fred"), voice("Google US English"), voice("Albert")];
    expect(pickVoice(voices, {})?.name).toBe("Google US English");
  });

  it("filters by language before falling back", () => {
    const voices = [voice("Thomas", "fr-FR"), voice("Karen", "en-AU")];
    expect(pickVoice(voices, { lang: "en" })?.name).toBe("Karen");
  });

  it("falls back to the first available voice", () => {
    const voices = [voice("Plain One"), voice("Plain Two")];
    expect(pickVoice(voices, {})?.name).toBe("Plain One");
  });
});

describe("humanizeChunks", () => {
  it("returns nothing for empty input", () => {
    expect(humanizeChunks("")).toEqual([]);
    expect(humanizeChunks("   ")).toEqual([]);
  });

  it("splits on clause and sentence punctuation", () => {
    const chunks = humanizeChunks("Hey Jordan, quick one. You free Thursday?");
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.map((c) => c.text).join(" ")).toContain("Hey Jordan,");
  });

  it("pauses longer after a sentence than a clause", () => {
    const chunks = humanizeChunks("First part, second part. Done.");
    const clause = chunks.find((c) => c.text.endsWith(","))!;
    const sentence = chunks.find((c) => c.text.endsWith("."))!;
    expect(sentence.pauseAfterMs).toBeGreaterThan(clause.pauseAfterMs);
  });

  it("keeps rate and pitch within natural bounds", () => {
    for (const c of humanizeChunks("A longer line of speech, with several clauses; and a final sentence here.")) {
      expect(c.rate).toBeGreaterThanOrEqual(0.6);
      expect(c.rate).toBeLessThanOrEqual(1.4);
      expect(c.pitch).toBeGreaterThanOrEqual(0.6);
      expect(c.pitch).toBeLessThanOrEqual(1.6);
    }
  });

  it("is deterministic — same input yields same prosody", () => {
    expect(humanizeChunks("Steady cadence, every time.")).toEqual(humanizeChunks("Steady cadence, every time."));
  });
});
