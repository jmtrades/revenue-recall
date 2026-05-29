import { describe, it, expect } from "vitest";
import { INDUSTRIES, getIndustry, isIndustryId, recallThresholdsFor } from "@/lib/industries";
import { DEFAULT_RECALL_THRESHOLDS } from "@/lib/recall/engine";

describe("industry selection contract", () => {
  it("accepts every shipped industry id", () => {
    for (const i of INDUSTRIES) expect(isIndustryId(i.id)).toBe(true);
  });

  it("rejects unknown ids (so onboarding/API can validate input)", () => {
    expect(isIndustryId("not_a_real_vertical")).toBe(false);
    expect(isIndustryId("")).toBe(false);
  });

  it("each industry resolves to a template whose currency we can adopt", () => {
    for (const i of INDUSTRIES) {
      const t = getIndustry(i.id);
      expect(t.id).toBe(i.id);
      expect(typeof t.currency).toBe("string");
      expect(t.currency.length).toBeGreaterThan(0);
    }
  });

  it("resolves complete recall thresholds for every industry (merged over defaults)", () => {
    for (const i of INDUSTRIES) {
      const t = recallThresholdsFor(i.id);
      for (const k of Object.keys(DEFAULT_RECALL_THRESHOLDS) as (keyof typeof DEFAULT_RECALL_THRESHOLDS)[]) {
        expect(typeof t[k]).toBe("number");
        expect(t[k]).toBeGreaterThan(0);
      }
    }
  });

  it("tunes fast verticals tighter and long-cycle verticals looser than default", () => {
    expect(recallThresholdsFor("home_services").goingColdDays).toBeLessThan(DEFAULT_RECALL_THRESHOLDS.goingColdDays);
    expect(recallThresholdsFor("auto").stalledDays).toBeLessThan(DEFAULT_RECALL_THRESHOLDS.stalledDays);
    expect(recallThresholdsFor("real_estate").lostWindowDays).toBeGreaterThan(DEFAULT_RECALL_THRESHOLDS.lostWindowDays);
    // An untuned vertical falls back to the defaults exactly.
    expect(recallThresholdsFor("generic")).toEqual(DEFAULT_RECALL_THRESHOLDS);
  });
});
