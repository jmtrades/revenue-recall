import { describe, it, expect, beforeEach } from "vitest";
import { recordRecallTouch, listRecallTouches, earliestTouchByDeal, touchesByWeek, __resetRecallEventsForTests, type RecallTouch } from "@/lib/recall/events";
import { computeRecallOutcomes, type RecallEnrollmentRef } from "@/lib/recall/engine";
import type { Opportunity, Stage } from "@/lib/crm/types";

beforeEach(() => __resetRecallEventsForTests());

describe("recall events store (in-memory)", () => {
  it("records and lists touches newest-first", async () => {
    await recordRecallTouch({ dealId: "d1", channel: "email", source: "cadence", occurredAt: "2026-02-01T00:00:00Z" });
    await recordRecallTouch({ dealId: "d2", channel: "sms", source: "manual", occurredAt: "2026-02-02T00:00:00Z" });
    const all = await listRecallTouches();
    expect(all).toHaveLength(2);
    expect(all[0].dealId).toBe("d2"); // unshifted → newest first
    expect(all[0].source).toBe("manual");
  });

  it("never throws on a bad call (attribution is best-effort)", async () => {
    await expect(recordRecallTouch({ channel: "call" })).resolves.toBeUndefined();
  });
});

describe("earliestTouchByDeal", () => {
  it("keeps the earliest occurredAt per deal and ignores deal-less touches", () => {
    const touches: RecallTouch[] = [
      { id: "1", dealId: "d1", channel: "email", source: "cadence", occurredAt: "2026-03-01T00:00:00Z" },
      { id: "2", dealId: "d1", channel: "sms", source: "manual", occurredAt: "2026-02-01T00:00:00Z" },
      { id: "3", channel: "email", source: "manual", occurredAt: "2026-01-01T00:00:00Z" }, // no deal
    ];
    const m = earliestTouchByDeal(touches);
    expect(m.get("d1")).toBe("2026-02-01T00:00:00Z");
    expect(m.size).toBe(1);
  });
});

describe("touchesByWeek", () => {
  const now = new Date("2026-03-15T12:00:00Z");
  const t = (occurredAt: string): RecallTouch => ({ id: occurredAt, dealId: "d", channel: "email", source: "cadence", occurredAt });

  it("buckets touches into trailing 7-day windows, oldest→newest", () => {
    const trend = touchesByWeek([
      t("2026-03-14T00:00:00Z"), // within 7 days → most recent window
      t("2026-03-13T00:00:00Z"), // most recent window
      t("2026-03-05T00:00:00Z"), // 10 days ago → previous window
    ], now, 6);
    expect(trend).toHaveLength(6);
    expect(trend[5].value).toBe(2); // most recent window
    expect(trend[4].value).toBe(1); // previous window
    expect(trend.slice(0, 4).every((w) => w.value === 0)).toBe(true);
  });

  it("ignores touches outside the window and bad dates", () => {
    const trend = touchesByWeek([t("2025-01-01T00:00:00Z"), t("not-a-date")], now, 6);
    expect(trend.reduce((s, w) => s + w.value, 0)).toBe(0);
  });
});

describe("computeRecallOutcomes with touch attribution", () => {
  const stages: Stage[] = [
    { id: "open", label: "Open", probability: 0.4, type: "open" },
    { id: "won", label: "Won", probability: 1, type: "won" },
  ];
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const deal = (p: Partial<Opportunity>): Opportunity => ({
    id: "d", title: "D", pipelineId: "p", stageId: "open", value: 4000, currency: "USD",
    contactId: "c", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z", ...p,
  });

  it("credits a manually-touched, non-enrolled deal that later won", () => {
    const opps = new Map<string, Opportunity>([["m1", deal({ id: "m1", stageId: "won", value: 7000, closedAt: "2026-02-20T00:00:00Z" })]]);
    const touched = new Map<string, string>([["m1", "2026-02-10T00:00:00Z"]]);
    const o = computeRecallOutcomes([], opps, stageMap, "USD", touched);
    expect(o.recalled).toBe(1);
    expect(o.reEngaged).toBe(1);
    expect(o.wonBack).toBe(1);
    expect(o.recoveredValue).toBe(7000);
  });

  it("does not double-count a deal that is both enrolled and touched", () => {
    const opps = new Map<string, Opportunity>([["d1", deal({ id: "d1", stageId: "won", value: 5000, closedAt: "2026-02-20T00:00:00Z" })]]);
    const enrollments: RecallEnrollmentRef[] = [{ sequenceId: "recall", dealId: "d1", stepIndex: 1, status: "active", enrolledAt: "2026-02-01T00:00:00Z" }];
    const touched = new Map<string, string>([["d1", "2026-02-05T00:00:00Z"]]);
    const o = computeRecallOutcomes(enrollments, opps, stageMap, "USD", touched);
    expect(o.recalled).toBe(1); // counted once, via the enrollment
    expect(o.wonBack).toBe(1);
    expect(o.recoveredValue).toBe(5000);
  });

  it("does not credit a touched deal that won before its first touch", () => {
    const opps = new Map<string, Opportunity>([["m1", deal({ id: "m1", stageId: "won", closedAt: "2026-01-15T00:00:00Z" })]]);
    const touched = new Map<string, string>([["m1", "2026-02-10T00:00:00Z"]]);
    const o = computeRecallOutcomes([], opps, stageMap, "USD", touched);
    expect(o.recalled).toBe(1);
    expect(o.wonBack).toBe(0);
  });
});
