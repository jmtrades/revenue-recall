import { describe, it, expect } from "vitest";
import { humanizeChunks, pickVoice, isSpeechSupported, isRecognitionSupported, speakable } from "@/lib/voice/speech";
import { normalizePrefs, DEFAULT_VOICE_PREFS, toVoicePrefs } from "@/lib/voice/prefs";

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

  it("prefers a neural/premium engine over a plain voice", () => {
    const voices = [voice("Microsoft David Desktop"), voice("Microsoft Aria Online (Natural)"), voice("Plain")];
    expect(pickVoice(voices, {})?.name).toBe("Microsoft Aria Online (Natural)");
  });

  it("avoids novelty/legacy voices even when they come first", () => {
    const voices = [voice("Zarvox"), voice("Albert"), voice("Samantha")];
    expect(pickVoice(voices, {})?.name).toBe("Samantha");
  });

  it("a premium marker outranks a legacy name penalty", () => {
    const voices = [voice("Samantha"), voice("Mark (Enhanced)")];
    // "Mark" is legacy, but "(Enhanced)" is a premium engine — it should win.
    expect(pickVoice(voices, {})?.name).toBe("Mark (Enhanced)");
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

describe("speakable normalization", () => {
  it("turns dashes into spoken pauses", () => {
    expect(speakable("Hey — quick one")).toBe("Hey, quick one");
  });

  it("expands units after numbers and common abbreviations", () => {
    expect(speakable("got 15 min?")).toContain("15 minutes");
    expect(speakable("1 min call")).toContain("1 minute");
    expect(speakable("e.g. Thursday")).toContain("for example,");
    expect(speakable("call ASAP")).toContain("as soon as possible");
    expect(speakable("us vs them")).toContain("versus");
  });

  it("voices symbols and strips bullets", () => {
    expect(speakable("sales & ops")).toContain("and");
    expect(speakable("up 20%")).toContain("20 percent");
    expect(speakable("• first point")).not.toContain("•");
  });

  it("expands weekday abbreviations", () => {
    expect(speakable("free Thu or Fri?")).toBe("free Thursday or Friday?");
  });

  it("voices money the way it's spoken", () => {
    expect(speakable("it's $1,200/mo")).toContain("1200 dollars");
    expect(speakable("saves you $2.5M a year")).toContain("2.5 million dollars");
    expect(speakable("about $3k")).toContain("3 thousand dollars");
    expect(speakable("$500")).toContain("500 dollars");
  });

  it("voices times as spelled meridiems", () => {
    expect(speakable("call at 2pm")).toContain("2 PM");
    expect(speakable("how about 11am")).toContain("11 AM");
    expect(speakable("at 2:30 p.m. works")).toContain("2:30 PM");
  });

  it("does not mangle ordinary words containing unit substrings", () => {
    // "minimum" must not become "minimumutes" etc.
    expect(speakable("the minimum is fine")).toBe("the minimum is fine");
  });

  it("speaks phone numbers as grouped digits, not one giant number", () => {
    expect(speakable("call me at 555-123-4567")).toContain("five five five, one two three, four five six seven");
    expect(speakable("ring (555) 867 5309")).toContain("five five five, eight six seven, five three zero nine");
    expect(speakable("dial +15551234567 today")).toContain("one five five five one two three four five six seven");
    expect(speakable("reach me on +1 555 123 4567")).toContain("one, five five five, one two three, four five six seven");
  });

  it("leaves large plain numbers (money) intact — only phone-shaped tokens convert", () => {
    // No separators / no leading + → not a phone, stays as voiced money.
    expect(speakable("you'd recover $150,000,000")).toContain("150000000 dollars");
    expect(speakable("you'd recover $150,000,000")).not.toContain("one five zero");
  });

  it("speaks email addresses naturally", () => {
    const out = speakable("email me at sales@acme.com");
    expect(out).toContain("sales at acme dot com");
    expect(out).not.toContain("@");
  });

  it("voices etc. and # the way they're said", () => {
    expect(speakable("forms, docs, etc.")).toContain("and so on");
    expect(speakable("you're #1 on my list")).toContain("number 1");
  });
});

describe("voice prefs", () => {
  it("clamps out-of-range values to safe bounds", () => {
    const p = normalizePrefs({ rate: 9, pitch: -3, voiceName: "Samantha" });
    expect(p.rate).toBeLessThanOrEqual(1.4);
    expect(p.pitch).toBeGreaterThanOrEqual(0.6);
    expect(p.voiceName).toBe("Samantha");
  });

  it("falls back to defaults for junk input", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_VOICE_PREFS);
    expect(normalizePrefs({ rate: "fast" }).rate).toBe(DEFAULT_VOICE_PREFS.rate);
    expect(normalizePrefs({ voiceName: "" }).voiceName).toBeUndefined();
  });

  it("maps into the speak() prefs shape", () => {
    const v = toVoicePrefs({ voiceName: "Alex", rate: 1.1, pitch: 0.9 });
    expect(v).toEqual({ preferName: "Alex", rate: 1.1, pitch: 0.9, lang: "en-US" });
  });
});
