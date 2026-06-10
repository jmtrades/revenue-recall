import { describe, it, expect } from "vitest";
import { aggregateBookingStats, type BookingStatRow } from "@/lib/meetings/stats";

const NOW = new Date("2026-06-10T00:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function row(p: Partial<BookingStatRow>): BookingStatRow {
  return { status: "confirmed", startsAt: ahead(2), createdAt: ago(2), ...p };
}

describe("aggregateBookingStats", () => {
  it("is all zeros (and any=false) with no rows", () => {
    const s = aggregateBookingStats([], NOW);
    expect(s).toMatchObject({ upcoming: 0, booked30d: 0, cancelled30d: 0, cancelRate: 0, any: false });
    expect(s.trend).toHaveLength(6);
    expect(s.trend.every((w) => w.value === 0)).toBe(true);
  });

  it("counts upcoming, 30-day booked/cancelled, cancel rate, and a 6-week trend", () => {
    const rows: BookingStatRow[] = [
      row({ status: "confirmed", startsAt: ahead(2), createdAt: ago(2) }), // upcoming + booked30d + this week
      row({ status: "confirmed", startsAt: ago(9), createdAt: ago(2) }), // past meeting → booked30d + this week, not upcoming
      row({ status: "cancelled", startsAt: ahead(1), createdAt: ago(5) }), // cancelled30d + this week
      row({ status: "confirmed", startsAt: ahead(21), createdAt: ago(40) }), // upcoming, but created >30d ago → not booked30d; week 5 of trend
      row({ status: "confirmed", startsAt: ago(5), createdAt: ago(60) }), // old + past → counts in nothing windowed
    ];
    const s = aggregateBookingStats(rows, NOW);
    expect(s.upcoming).toBe(2); // the two future confirmed
    expect(s.booked30d).toBe(2);
    expect(s.cancelled30d).toBe(1);
    expect(s.cancelRate).toBeCloseTo(1 / 3, 5);
    expect(s.any).toBe(true);
    // trend oldest→newest: 5 weeks ago has the 40-day-old booking; this week has 3.
    expect(s.trend.map((w) => w.value)).toEqual([1, 0, 0, 0, 0, 3]);
  });

  it("computes no-show rate over recently-occurred meetings", () => {
    const rows: BookingStatRow[] = [
      row({ status: "completed", startsAt: ago(2), createdAt: ago(5) }),
      row({ status: "completed", startsAt: ago(4), createdAt: ago(6) }),
      row({ status: "no_show", startsAt: ago(3), createdAt: ago(7) }),
      row({ status: "no_show", startsAt: ago(40), createdAt: ago(45) }), // outside the 30d window → ignored
    ];
    const s = aggregateBookingStats(rows, NOW);
    expect(s.noShow30d).toBe(1); // only the recent no-show
    expect(s.noShowRate).toBeCloseTo(1 / 3, 5); // 1 no-show / (2 completed + 1 no-show)
  });

  it("ignores malformed dates rather than throwing", () => {
    const s = aggregateBookingStats([row({ createdAt: "nope", startsAt: "nope" })], NOW);
    expect(s.any).toBe(true);
    expect(s.upcoming).toBe(0);
    expect(s.booked30d).toBe(0);
  });
});
