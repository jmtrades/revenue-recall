import { describe, it, expect } from "vitest";
import { clampSnoozeDays, snoozeUntilIso, listSnoozedOppIds } from "@/lib/recall/snooze";

describe("clampSnoozeDays", () => {
  it("keeps sane values, clamps the extremes, defaults junk to a week", () => {
    expect(clampSnoozeDays(7)).toBe(7);
    expect(clampSnoozeDays(1)).toBe(1);
    expect(clampSnoozeDays(90)).toBe(90);
    expect(clampSnoozeDays(0)).toBe(1); // never < 1
    expect(clampSnoozeDays(1000)).toBe(90); // never > 90
    expect(clampSnoozeDays(3.9)).toBe(3); // floored
    expect(clampSnoozeDays(NaN)).toBe(7); // safe default
  });
});

describe("snoozeUntilIso", () => {
  it("returns the clamped number of days from now as ISO", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(snoozeUntilIso(7, now)).toBe(new Date(now + 7 * 86400000).toISOString());
    // clamped before the date math
    expect(snoozeUntilIso(0, now)).toBe(new Date(now + 1 * 86400000).toISOString());
    expect(snoozeUntilIso(1000, now)).toBe(new Date(now + 90 * 86400000).toISOString());
  });
});

describe("listSnoozedOppIds (graceful degradation)", () => {
  it("returns an empty set with no database configured — so the queue always renders", async () => {
    expect(await listSnoozedOppIds()).toEqual(new Set());
  });
});
