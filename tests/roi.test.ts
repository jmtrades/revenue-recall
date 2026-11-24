import { describe, expect, it } from "vitest";
import { computeRoi, filterTimeline, leadKey, minutesSaved } from "@/lib/roi/model";
import { mergeLedger, projectActivity } from "@/lib/roi/project";
import { buildWeeklySummary } from "@/lib/roi/weekly";
import { roiToCsv } from "@/lib/roi/csv";
import { recordRoiEvent, listRoiEvents, __resetRoiForTests } from "@/lib/roi/store";
import { SAVED_MINUTES, type RoiEvent } from "@/lib/roi/types";
import type { Activity } from "@/lib/crm/types";

const NOW = new Date("2026-06-15T12:00:00Z");

function ev(partial: Partial<RoiEvent> & Pick<RoiEvent, "name" | "occurredAt">): RoiEvent {
  return {
    id: partial.dedupeKey ?? partial.id ?? `${partial.name}:${partial.occurredAt}`,
    dedupeKey: partial.dedupeKey ?? partial.id ?? `${partial.name}:${partial.occurredAt}`,
    channel: partial.channel,
    contactId: partial.contactId,
    dealId: partial.dealId,
    leadId: partial.leadId,
    campaignId: partial.campaignId,
    sequenceId: partial.sequenceId,
    revenue: partial.revenue,
    cost: partial.cost,
    actor: partial.actor,
    name: partial.name,
    occurredAt: partial.occurredAt,
  };
}

describe("ROI attribution", () => {
  it("credits a win to the last touch inside the window, and the revenue to that channel", () => {
    const report = computeRoi(
      [
        ev({ name: "message.sent", occurredAt: "2026-06-01T12:00:00Z", channel: "email", contactId: "c1", dealId: "d1", sequenceId: "recall", actor: "ai" }),
        ev({ name: "call.dialed", occurredAt: "2026-06-10T12:00:00Z", channel: "call", contactId: "c1", dealId: "d1", actor: "user" }),
        ev({ name: "deal.won", occurredAt: "2026-06-12T12:00:00Z", dealId: "d1", contactId: "c1", revenue: 4800 }),
        ev({ name: "message.sent", occurredAt: "2026-04-01T12:00:00Z", channel: "sms", contactId: "c1", dealId: "d1" }),
      ],
      { now: NOW, windowDays: 30 },
    );
    expect(report.revenueRecovered).toBe(4800);
    expect(report.wonDeals).toBe(1);
    const win = report.attributions.find((a) => a.outcome === "deal.won");
    expect(win?.channel).toBe("call");
    expect(win?.touchName).toBe("call.dialed");
    expect(report.channels.find((c) => c.channel === "call")?.revenue).toBe(4800);
    expect(report.channels.find((c) => c.channel === "email")?.revenue ?? 0).toBe(0);
  });

  it("does not attribute a touch older than 21 days", () => {
    const report = computeRoi(
      [
        ev({ name: "message.sent", occurredAt: "2026-05-01T12:00:00Z", channel: "email", contactId: "c1", dealId: "d1" }),
        ev({ name: "deal.won", occurredAt: "2026-06-10T12:00:00Z", dealId: "d1", contactId: "c1", revenue: 1000 }),
      ],
      { now: NOW, windowDays: 60 },
    );
    const win = report.attributions.find((a) => a.outcome === "deal.won");
    expect(win?.touchName).toBeUndefined();
  });

  it("counts a webinar leave that later books as a rescued lead", () => {
    const report = computeRoi(
      [
        ev({ name: "webinar.joined", occurredAt: "2026-06-10T15:00:00Z", channel: "webinar", leadId: "r1" }),
        ev({ name: "webinar.left", occurredAt: "2026-06-10T15:20:00Z", channel: "webinar", leadId: "r1" }),
        ev({ name: "webinar.left", occurredAt: "2026-06-10T15:21:00Z", channel: "webinar", leadId: "r2" }),
        ev({ name: "webinar.left", occurredAt: "2026-06-10T15:22:00Z", channel: "webinar", leadId: "r3" }),
        ev({ name: "webinar.left", occurredAt: "2026-06-10T15:23:00Z", channel: "webinar", leadId: "r4" }),
        ev({ name: "webinar.left", occurredAt: "2026-06-10T15:24:00Z", channel: "webinar", leadId: "r5" }),
        ev({ name: "meeting.booked", occurredAt: "2026-06-10T16:00:00Z", channel: "meeting", leadId: "r1" }),
      ],
      { now: NOW },
    );
    expect(report.rescuedLeads).toBe(1);
    expect(report.webinarLeft).toBe(5);
    expect(report.insights.some((i) => i.title.includes("drop-off"))).toBe(true);
  });

  it("estimates hours only from AI actions, and counts a completed dial once", () => {
    const events = [
      ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", actor: "ai", channel: "email", contactId: "c1" }),
      ev({ name: "message.sent", occurredAt: "2026-06-10T12:05:00Z", actor: "user", channel: "email", contactId: "c2" }),
      ev({ name: "call.dialed", occurredAt: "2026-06-10T13:00:00Z", actor: "ai", channel: "call", contactId: "c1" }),
      ev({ name: "call.completed", occurredAt: "2026-06-10T13:10:00Z", actor: "ai", channel: "call", contactId: "c1" }),
      ev({ name: "ai.action", occurredAt: "2026-06-10T13:20:00Z", actor: "ai", channel: "email", contactId: "c1" }),
    ];
    const minutes = minutesSaved(events);
    expect(minutes).toBe(SAVED_MINUTES.aiMessage + SAVED_MINUTES.aiCall + SAVED_MINUTES.aiAction);
    const report = computeRoi(events, { now: NOW });
    expect(report.hoursSaved).toBe(Math.round((minutes / 60) * 10) / 10);
    expect(report.hoursNote).toContain("not a timesheet");
  });

  it("compares the window to the one before it", () => {
    const report = computeRoi(
      [
        ev({ name: "message.replied", occurredAt: "2026-06-10T12:00:00Z", channel: "email", contactId: "c1" }),
        ev({ name: "message.replied", occurredAt: "2026-04-20T12:00:00Z", channel: "email", contactId: "c2" }),
        ev({ name: "message.replied", occurredAt: "2026-04-21T12:00:00Z", channel: "email", contactId: "c3" }),
      ],
      { now: NOW, windowDays: 30 },
    );
    expect(report.current.replies).toBe(1);
    expect(report.prior.replies).toBe(2);
    expect(report.delta.replies).toBe(-50);
  });

  it("builds a cohort from the week a lead first appeared", () => {
    const report = computeRoi(
      [
        ev({ name: "message.sent", occurredAt: "2026-06-02T12:00:00Z", channel: "email", contactId: "c1" }),
        ev({ name: "message.replied", occurredAt: "2026-06-03T12:00:00Z", channel: "email", contactId: "c1" }),
        ev({ name: "message.sent", occurredAt: "2026-06-02T12:00:00Z", channel: "email", contactId: "c2" }),
      ],
      { now: NOW, windowDays: 30 },
    );
    const cohort = report.cohorts.find((c) => c.week === "2026-06-01");
    expect(cohort?.leads).toBe(2);
    expect(cohort?.recovered).toBe(1);
    expect(leadKey({ contactId: "c1" })).toBe("contact:c1");
  });

  it("flags a channel that spent and got silence", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({
        name: "message.sent",
        occurredAt: `2026-06-${String(10 + i).padStart(2, "0")}T12:00:00Z`,
        channel: "sms",
        contactId: `c${i}`,
        cost: 0.2,
        dedupeKey: `s${i}`,
      }),
    );
    const report = computeRoi(events, { now: NOW });
    expect(report.insights.some((i) => i.title.includes("sms"))).toBe(true);
  });
});

describe("ledger merge", () => {
  it("keeps a stored send and does not double it with the CRM activity", () => {
    const stored = [
      ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", channel: "email", contactId: "c1", dedupeKey: "live" }),
    ];
    const activity: Activity = {
      id: "a1",
      kind: "email",
      summary: "Hello",
      occurredAt: "2026-06-10T12:00:30Z",
      direction: "outbound",
      contactId: "c1",
    };
    const merged = mergeLedger(stored, [activity], [], []);
    expect(merged.filter((e) => e.name === "message.sent")).toHaveLength(1);
  });

  it("projects an inbound email as a reply and stamps a recall touch onto the matching send", () => {
    const reply: Activity = {
      id: "a2",
      kind: "email",
      summary: "Re: pricing",
      occurredAt: "2026-06-10T15:00:00Z",
      direction: "inbound",
      contactId: "c9",
      opportunityId: "d9",
    };
    const send: Activity = {
      id: "a3",
      kind: "email",
      summary: "Following up",
      occurredAt: "2026-06-10T14:00:00Z",
      direction: "outbound",
      contactId: "c9",
      opportunityId: "d9",
    };
    expect(projectActivity(reply)?.name).toBe("message.replied");
    const merged = mergeLedger(
      [],
      [reply, send],
      [{ id: "t1", channel: "email", source: "autopilot", occurredAt: "2026-06-10T14:00:20Z", contactId: "c9", dealId: "d9", sequenceId: "recall" }],
      [],
    );
    expect(merged.find((e) => e.name === "message.replied")?.name).toBe("message.replied");
    const row = merged.find((e) => e.name === "message.sent");
    expect(row?.actor).toBe("ai");
    expect(row?.campaignId).toBe("recall");
  });

  it("adds a won deal once", () => {
    const merged = mergeLedger([], [], [], [{ dealId: "d1", value: 2500, wonAt: "2026-06-11T00:00:00Z" }]);
    expect(merged.filter((e) => e.name === "deal.won")).toHaveLength(1);
    const again = mergeLedger(merged, [], [], [{ dealId: "d1", value: 2500, wonAt: "2026-06-11T00:00:00Z" }]);
    expect(again.filter((e) => e.name === "deal.won")).toHaveLength(1);
  });
});

describe("weekly summary and export", () => {
  it("says the week was empty instead of inventing a result", () => {
    const report = computeRoi([], { now: NOW });
    const letter = buildWeeklySummary(report, "Northwind");
    expect(letter.subject).toContain("Northwind");
    expect(letter.body).toContain("nothing was logged");
    expect(letter.body).not.toMatch(/\$[1-9]/);
  });

  it("writes the computed numbers and the estimate disclaimer", () => {
    const report = computeRoi(
      [
        ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", channel: "email", contactId: "c1", actor: "ai" }),
        ev({ name: "message.replied", occurredAt: "2026-06-10T13:00:00Z", channel: "email", contactId: "c1" }),
        ev({ name: "deal.won", occurredAt: "2026-06-11T12:00:00Z", dealId: "d1", contactId: "c1", revenue: 1200 }),
      ],
      { now: NOW },
    );
    const letter = buildWeeklySummary(report, "Northwind", "https://recall-touch.com/results");
    expect(letter.body).toContain("$1,200");
    expect(letter.body).toContain("not a timesheet");
    expect(letter.body).toContain("https://recall-touch.com/results");
    const csv = roiToCsv(report.timeline, report.attributions);
    expect(csv).toContain("deal.won");
    expect(csv.split("\r\n")[0]).toContain("attributed_channel");
  });

  it("neutralizes a formula-looking campaign id in the export", () => {
    const csv = roiToCsv(
      [ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", channel: "email", campaignId: "=HYPERLINK(\"http://evil\")", contactId: "c1" })],
      [],
    );
    expect(csv).toContain("'=HYPERLINK");
  });

  it("filters a lead timeline by contact id", () => {
    const events = [
      ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", contactId: "c1" }),
      ev({ name: "message.sent", occurredAt: "2026-06-10T12:00:00Z", contactId: "c2", dedupeKey: "other" }),
    ];
    expect(filterTimeline(events, "c1")).toHaveLength(1);
  });
});

describe("roi store", () => {
  it("dedupes a retried event in memory", async () => {
    __resetRoiForTests();
    await recordRoiEvent({ dedupeKey: "k1", name: "message.sent", orgId: "org-a", channel: "email", contactId: "c1" });
    await recordRoiEvent({ dedupeKey: "k1", name: "message.sent", orgId: "org-a", channel: "email", contactId: "c1" });
    await recordRoiEvent({ dedupeKey: "k1", name: "message.sent", orgId: "org-b", channel: "email", contactId: "c1" });
    const a = await listRoiEvents("org-a");
    const b = await listRoiEvents("org-b");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].name).toBe("message.sent");
    __resetRoiForTests();
  });
});
