import { describe, it, expect } from "vitest";
import { zonedWallTimeToUtc, generateSlots, defaultAvailability, isSlotAvailable } from "@/lib/meetings/availability";
import type { Availability } from "@/lib/meetings/types";

describe("zonedWallTimeToUtc", () => {
  it("maps a wall-clock time in a zone to the right UTC instant (standard time)", () => {
    // 09:00 in New York on Jan 15 (EST, UTC-5) → 14:00 UTC.
    expect(zonedWallTimeToUtc(2025, 1, 15, 9, 0, "America/New_York").toISOString()).toBe("2025-01-15T14:00:00.000Z");
  });

  it("accounts for daylight saving (summer)", () => {
    // 09:00 in New York on Jul 15 (EDT, UTC-4) → 13:00 UTC.
    expect(zonedWallTimeToUtc(2025, 7, 15, 9, 0, "America/New_York").toISOString()).toBe("2025-07-15T13:00:00.000Z");
  });

  it("handles a half-hour offset zone", () => {
    // 09:00 in Kolkata (UTC+5:30) → 03:30 UTC.
    expect(zonedWallTimeToUtc(2025, 6, 15, 9, 0, "Asia/Kolkata").toISOString()).toBe("2025-06-15T03:30:00.000Z");
  });

  it("treats an empty / invalid zone as UTC", () => {
    expect(zonedWallTimeToUtc(2025, 6, 15, 9, 0, "").toISOString()).toBe("2025-06-15T09:00:00.000Z");
    expect(zonedWallTimeToUtc(2025, 6, 15, 9, 0, "Not/AZone").toISOString()).toBe("2025-06-15T09:00:00.000Z");
  });
});

// A simple UTC schedule keeps slot assertions exact: windows are wall-clock UTC.
function utcAvail(weekly: Availability["weekly"], over: Partial<Availability> = {}): Availability {
  return { timezone: "UTC", weekly, slotMinutes: 30, minNoticeMinutes: 0, horizonDays: 14, ...over };
}

describe("generateSlots", () => {
  // A fixed Monday so weekday math is deterministic. 2025-01-06 is a Monday.
  const monday = new Date("2025-01-06T00:00:00.000Z");

  it("produces grid-aligned slots within a window and none on closed days", () => {
    const avail = utcAvail({ 1: [{ start: "09:00", end: "11:00" }] }); // Mondays only
    const slots = generateSlots(avail, { durationMinutes: 30, now: monday });
    const onMonday = slots.filter((s) => s.start.startsWith("2025-01-06"));
    // 09:00, 09:30, 10:00, 10:30 — last 30-min slot must finish by 11:00.
    expect(onMonday.map((s) => s.start)).toEqual([
      "2025-01-06T09:00:00.000Z",
      "2025-01-06T09:30:00.000Z",
      "2025-01-06T10:00:00.000Z",
      "2025-01-06T10:30:00.000Z",
    ]);
    // Tuesday is closed → nothing the next day.
    expect(slots.some((s) => s.start.startsWith("2025-01-07"))).toBe(false);
  });

  it("respects slot length and meeting duration (a 60-min meeting can't start at 10:30)", () => {
    const avail = utcAvail({ 1: [{ start: "09:00", end: "11:00" }] }, { slotMinutes: 30 });
    const starts = generateSlots(avail, { durationMinutes: 60, now: monday })
      .filter((s) => s.start.startsWith("2025-01-06"))
      .map((s) => s.start);
    expect(starts).toEqual(["2025-01-06T09:00:00.000Z", "2025-01-06T09:30:00.000Z", "2025-01-06T10:00:00.000Z"]);
  });

  it("enforces minimum notice", () => {
    const avail = utcAvail({ 1: [{ start: "09:00", end: "12:00" }] }, { minNoticeMinutes: 120 });
    // now = Monday 09:10 → first bookable start is ≥ 11:10 → 11:30 on the 30-min grid.
    const now = new Date("2025-01-06T09:10:00.000Z");
    const first = generateSlots(avail, { durationMinutes: 30, now }).filter((s) => s.start.startsWith("2025-01-06"))[0];
    expect(first.start).toBe("2025-01-06T11:30:00.000Z");
  });

  it("removes slots that overlap an existing booking", () => {
    const avail = utcAvail({ 1: [{ start: "09:00", end: "11:00" }] });
    const busy = [{ start: "2025-01-06T09:30:00.000Z", end: "2025-01-06T10:00:00.000Z" }];
    const starts = generateSlots(avail, { durationMinutes: 30, now: monday, busy })
      .filter((s) => s.start.startsWith("2025-01-06"))
      .map((s) => s.start);
    expect(starts).not.toContain("2025-01-06T09:30:00.000Z");
    expect(starts).toContain("2025-01-06T09:00:00.000Z");
  });

  it("returns nothing when there are no windows", () => {
    expect(generateSlots(utcAvail({}), { durationMinutes: 30, now: monday })).toEqual([]);
  });

  it("stays within the horizon", () => {
    const avail = utcAvail({ 0: [{ start: "09:00", end: "10:00" }], 1: [{ start: "09:00", end: "10:00" }], 2: [{ start: "09:00", end: "10:00" }], 3: [{ start: "09:00", end: "10:00" }], 4: [{ start: "09:00", end: "10:00" }], 5: [{ start: "09:00", end: "10:00" }], 6: [{ start: "09:00", end: "10:00" }] }, { horizonDays: 2 });
    const days = new Set(generateSlots(avail, { durationMinutes: 30, now: monday }).map((s) => s.start.slice(0, 10)));
    // now + 2-day horizon → at most 3 distinct calendar days.
    expect(days.size).toBeLessThanOrEqual(3);
  });
});

describe("defaultAvailability + isSlotAvailable", () => {
  it("defaults to weekdays 9–5 and offers no weekend slots", () => {
    const avail = defaultAvailability("UTC");
    expect(avail.weekly[6]).toBeUndefined(); // Saturday
    expect(avail.weekly[0]).toBeUndefined(); // Sunday
    expect(avail.weekly[1]).toEqual([{ start: "09:00", end: "17:00" }]);
  });

  it("validates a concrete start against the live grid", () => {
    const avail = utcAvail({ 1: [{ start: "09:00", end: "11:00" }] });
    const now = new Date("2025-01-06T00:00:00.000Z");
    expect(isSlotAvailable(avail, { durationMinutes: 30, now }, "2025-01-06T09:30:00.000Z")).toBe(true);
    expect(isSlotAvailable(avail, { durationMinutes: 30, now }, "2025-01-06T09:07:00.000Z")).toBe(false); // off-grid
    expect(isSlotAvailable(avail, { durationMinutes: 30, now }, "2025-01-06T12:00:00.000Z")).toBe(false); // outside window
  });
});
