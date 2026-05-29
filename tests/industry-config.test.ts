import { describe, it, expect } from "vitest";
import { INDUSTRIES, getIndustry, isIndustryId } from "@/lib/industries";

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
});
