import { describe, it, expect } from "vitest";
import { SEGMENTS, getSegment, highValueThreshold, type SegmentRow } from "@/lib/crm/segments";

const ctx = (highValueThresholdValue: number) => ({ highValueThreshold: highValueThresholdValue });

describe("highValueThreshold (top quartile)", () => {
  it("returns the 75th-percentile positive value", () => {
    expect(highValueThreshold([100, 200, 300, 400])).toBe(400);
    expect(highValueThreshold([10, 20, 30, 40, 50, 60, 70, 80])).toBe(70);
  });
  it("ignores nulls and non-positive values", () => {
    expect(highValueThreshold([null, 0, -5, 100, 200, 300, 400])).toBe(400);
  });
  it("is Infinity when nothing is positive (segment then matches nothing)", () => {
    expect(highValueThreshold([null, 0, -1])).toBe(Infinity);
  });
});

describe("segment predicates", () => {
  const row = (over: Partial<SegmentRow> = {}): SegmentRow => ({ value: null, ...over });

  it("All matches everything", () => {
    expect(getSegment("all").match(row(), ctx(100))).toBe(true);
  });
  it("Needs triage matches only unset status", () => {
    const seg = getSegment("no_status");
    expect(seg.match(row({ status: undefined }), ctx(100))).toBe(true);
    expect(seg.match(row({ status: "qualified" }), ctx(100))).toBe(false);
  });
  it("status segments match their status", () => {
    expect(getSegment("qualified").match(row({ status: "qualified" }), ctx(100))).toBe(true);
    expect(getSegment("customer").match(row({ status: "customer" }), ctx(100))).toBe(true);
    expect(getSegment("working").match(row({ status: "qualified" }), ctx(100))).toBe(false);
  });
  it("High value needs a finite threshold and value at/above it", () => {
    const seg = getSegment("high_value");
    expect(seg.match(row({ value: 500 }), ctx(400))).toBe(true);
    expect(seg.match(row({ value: 100 }), ctx(400))).toBe(false);
    expect(seg.match(row({ value: 9999 }), ctx(Infinity))).toBe(false); // no positive values
    expect(seg.match(row({ value: null }), ctx(400))).toBe(false);
  });
  it("getSegment falls back to All for unknown ids", () => {
    expect(getSegment("nope").id).toBe("all");
    expect(SEGMENTS[0].id).toBe("all");
  });
});
