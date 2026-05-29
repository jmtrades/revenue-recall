import { describe, it, expect } from "vitest";
import { LANGUAGES, getLanguage, isLanguageCode, localeFor, languageDirective, DEFAULT_LANGUAGE } from "@/lib/languages";

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

  it("every language has a distinct code and a non-empty locale/native name", () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    expect(codes.size).toBe(LANGUAGES.length);
    for (const l of LANGUAGES) {
      expect(l.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(l.native.length).toBeGreaterThan(0);
    }
  });
});
