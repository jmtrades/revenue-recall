import { describe, it, expect } from "vitest";
import { importContactAttributes } from "@/lib/import/attributes";
import { hasCallConsent, hasSmsConsent } from "@/lib/agent/guardrails";

const NOW = "2026-06-17T12:00:00Z";

describe("importContactAttributes", () => {
  it("returns undefined when neither language nor consent is set", () => {
    expect(importContactAttributes(undefined, undefined, NOW)).toBeUndefined();
    expect(importContactAttributes(undefined, false, NOW)).toBeUndefined();
  });

  it("sets only the preferred language when consent is off", () => {
    expect(importContactAttributes("es", false, NOW)).toEqual({ preferredLanguage: "es" });
  });

  it("stamps call + SMS consent markers the guardrails recognize", () => {
    const a = importContactAttributes(undefined, true, NOW)!;
    expect(a.callConsentAt).toBe(NOW);
    // The contact built from these attrs must pass the autopilot consent gates.
    const contact = { id: "c", name: "x", points: [], attributes: a as never };
    expect(hasCallConsent(contact)).toBe(true);
    expect(hasSmsConsent(contact)).toBe(true);
  });

  it("merges language and consent together", () => {
    const a = importContactAttributes("fr", true, NOW)!;
    expect(a.preferredLanguage).toBe("fr");
    expect(a.callConsent).toBe(true);
  });
});
