import { describe, it, expect } from "vitest";
import { objectionGuide } from "@/lib/calls/objection-guide";

describe("objectionGuide", () => {
  it("returns all five objection kinds in rep-priority order with non-empty angles", () => {
    const g = objectionGuide("real_estate");
    expect(g.map((e) => e.kind)).toEqual(["price", "timing", "competitor", "trust", "info"]);
    expect(g.every((e) => e.label.length > 0 && e.angle.length > 0)).toBe(true);
  });

  it("pulls industry-specific reframes from the playbook", () => {
    const re = objectionGuide("real_estate");
    const generic = objectionGuide("generic");
    // Different industries reframe the same objection differently.
    expect(re.find((e) => e.kind === "price")?.angle).not.toBe(generic.find((e) => e.kind === "price")?.angle);
  });

  it("falls back gracefully for an unknown industry (generic playbook)", () => {
    const g = objectionGuide("does-not-exist");
    expect(g).toHaveLength(5);
    expect(g.every((e) => e.angle.length > 0)).toBe(true);
  });
});
