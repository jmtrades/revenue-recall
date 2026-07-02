import { describe, it, expect } from "vitest";
import { prospectStrings, fill, _EN } from "@/lib/i18n/prospect";
import { LANGUAGES } from "@/lib/languages";

describe("prospectStrings", () => {
  it("returns the complete English base for en / unknown / empty", () => {
    expect(prospectStrings("en")).toEqual(_EN);
    expect(prospectStrings("xx")).toEqual(_EN);
    expect(prospectStrings(undefined)).toEqual(_EN);
  });

  it("overlays a localized catalog over the English base (es)", () => {
    const s = prospectStrings("es");
    expect(s.send).toBe("Enviar");
    expect(s.bookedTitle).toBe("Reserva confirmada");
    // Anything a catalog doesn't override falls back to English, never undefined.
    for (const [k, v] of Object.entries(s)) {
      expect(v, `key ${k} must resolve`).toBeTruthy();
    }
  });

  it("provides a localized catalog for every supported language beyond English", () => {
    for (const lang of LANGUAGES.filter((l) => l.code !== "en")) {
      const s = prospectStrings(lang.code);
      // Each catalog must actually translate. Spot-check the confirm button —
      // unlike "Send" (identical in Danish/Norwegian), it never coincides with
      // the English string in a real translation.
      expect(s.confirm, `${lang.code} should translate "Confirm booking"`).not.toBe(_EN.confirm);
    }
  });

  it("exactly the right-to-left scripts render rtl", () => {
    const RTL = new Set(["ar", "he", "fa", "ur", "ps"]);
    for (const lang of LANGUAGES) {
      expect(prospectStrings(lang.code).dir, lang.code).toBe(RTL.has(lang.code) ? "rtl" : "ltr");
    }
  });

  it("keeps every template's {tokens} intact in every language (so fill works)", () => {
    const tokensOf = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
    const templates: (keyof typeof _EN)[] = ["formThanksBody", "formHeading", "bookingHeading", "bookedWith", "timesIn", "emailSubject", "emailGreeting", "emailBooked", "emailWhen", "emailWhere"];
    for (const lang of LANGUAGES) {
      const s = prospectStrings(lang.code);
      for (const key of templates) {
        expect(tokensOf(String(s[key])), `${lang.code}.${key} must keep tokens`).toEqual(tokensOf(String(_EN[key])));
      }
    }
  });
});

describe("fill", () => {
  it("resolves tokens and leaves unknown ones visible", () => {
    expect(fill("Book a {meeting} with {brand}", { meeting: "demo", brand: "Acme" })).toBe("Book a demo with Acme");
    expect(fill("Hello {name}", {})).toBe("Hello {name}");
  });
});
