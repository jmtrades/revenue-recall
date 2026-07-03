import { describe, it, expect } from "vitest";
import { LANGUAGES, getLanguage, isLanguageCode, localeFor, languageDirective, toLanguageCode, contactPreferredLanguage, voiceCallSupported, DEFAULT_LANGUAGE } from "@/lib/languages";

describe("languages", () => {
  it("validates known and unknown codes", () => {
    for (const l of LANGUAGES) expect(isLanguageCode(l.code)).toBe(true);
    expect(isLanguageCode("xx")).toBe(false);
    expect(isLanguageCode("")).toBe(false);
  });

  it("falls back to English for unknown codes", () => {
    expect(getLanguage("xx").code).toBe(DEFAULT_LANGUAGE);
    expect(getLanguage(undefined).code).toBe(DEFAULT_LANGUAGE);
    expect(getLanguage(null).code).toBe(DEFAULT_LANGUAGE);
  });

  it("flags live-call support honestly (drives the placement gate + picker split)", () => {
    expect(voiceCallSupported("en")).toBe(true);
    expect(voiceCallSupported("es")).toBe(true);
    expect(voiceCallSupported("th")).toBe(false); // text outreach only today
    expect(voiceCallSupported("xx")).toBe(true); // unknown → English fallback, which IS callable
    // Both tiers are non-empty — the picker's optgroups never render blank.
    expect(LANGUAGES.some((l) => l.voiceCall)).toBe(true);
    expect(LANGUAGES.some((l) => !l.voiceCall)).toBe(true);
  });

  it("maps a language to a BCP-47 TTS locale", () => {
    expect(localeFor("es")).toBe("es-ES");
    expect(localeFor("pt")).toBe("pt-BR");
    expect(localeFor("xx")).toBe("en-US"); // fallback
  });

  it("gives no drafting directive for English, a strong one otherwise", () => {
    expect(languageDirective("en")).toBe("");
    expect(languageDirective(undefined)).toBe("");
    const es = languageDirective("es");
    expect(es).toContain("Spanish");
    expect(es).toContain("Español");
    expect(es.toLowerCase()).toContain("idiomatic");
  });

  it("coerces codes, labels, native names, and locales to a code", () => {
    expect(toLanguageCode("es")).toBe("es");
    expect(toLanguageCode("Spanish")).toBe("es");
    expect(toLanguageCode("Español")).toBe("es");
    expect(toLanguageCode("es-MX")).toBe("es"); // locale variant → base code
    expect(toLanguageCode("PT")).toBe("pt");
    expect(toLanguageCode("Klingon")).toBeUndefined();
    expect(toLanguageCode("")).toBeUndefined();
    expect(toLanguageCode(null)).toBeUndefined();
  });

  it("resolves a contact's preferred language with org fallback", () => {
    expect(contactPreferredLanguage({ preferredLanguage: "fr" }, "en")).toBe("fr");
    expect(contactPreferredLanguage({ language: "Spanish" }, "en")).toBe("es"); // coerced
    expect(contactPreferredLanguage({ preferredLanguage: "bogus" }, "de")).toBe("de"); // invalid → fallback
    expect(contactPreferredLanguage({}, "pt")).toBe("pt");
    expect(contactPreferredLanguage(undefined, "en")).toBe("en");
    expect(contactPreferredLanguage({ preferredLanguage: 42 }, "en")).toBe("en"); // non-string → fallback
  });

  it("every language has a distinct code and a non-empty locale/native name", () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    expect(codes.size).toBe(LANGUAGES.length);
    for (const l of LANGUAGES) {
      // BCP-47 primary subtags are 2 OR 3 letters (e.g. "fil-PH" for Filipino).
      expect(l.locale).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
      expect(l.native.length).toBeGreaterThan(0);
    }
  });
});
