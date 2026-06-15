import { describe, it, expect } from "vitest";
import { normalizePlanParam, isPlanId } from "@/lib/billing/plans";

describe("normalizePlanParam — friendly ?plan= names map to billing keys", () => {
  it("maps marketing names to canonical PlanIds", () => {
    expect(normalizePlanParam("operator")).toBe("growth");
    expect(normalizePlanParam("autopilot")).toBe("team");
    expect(normalizePlanParam("starter")).toBe("free");
    expect(normalizePlanParam("Operator")).toBe("growth"); // case-insensitive
  });
  it("keeps legacy keys working (back-compat) and rejects junk", () => {
    expect(normalizePlanParam("growth")).toBe("growth");
    expect(normalizePlanParam("team")).toBe("team");
    expect(normalizePlanParam("scale")).toBe("scale");
    expect(normalizePlanParam("nope")).toBeUndefined();
    expect(normalizePlanParam(undefined)).toBeUndefined();
  });
  it("every alias resolves to a valid PlanId", () => {
    for (const a of ["operator", "autopilot", "starter", "growth", "team", "scale", "free"]) {
      expect(isPlanId(normalizePlanParam(a))).toBe(true);
    }
  });
});
