import { describe, it, expect } from "vitest";
import { callStats, callOutcomeOf, callSeconds, bestCallWindow, windowLabel, requestedCallbacks, callsToday, MIN_SAMPLE_DIALS, MIN_WINDOW_DIALS } from "@/lib/calls/analytics";
import { QUICK_OUTCOMES } from "@/lib/dialer-flow";
import type { Activity } from "@/lib/crm/types";

const NOW = new Date("2026-06-12T15:00:00Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

function call(summary: string, hoursAgo: number, partial: Partial<Activity> = {}): Activity {
  return { id: "a", kind: "call", direction: "outbound", summary, occurredAt: at(hoursAgo), ...partial } as Activity;
}

describe("call outcome + duration parsing", () => {
  it("reads the dialer's [Label] prefix and the gateway's 'Call — outcome' form", () => {
    expect(callOutcomeOf("[No answer] No pickup — re-queued.")).toBe("No answer");
    expect(callOutcomeOf("[Connected] Talked pricing — Next: send comps")).toBe("Connected");
    expect(callOutcomeOf("Call — completed (184s)\nFull transcript…")).toBe("completed");
    expect(callOutcomeOf("random note")).toBe("");
  });

  it("extracts connected seconds from the gateway's '(123s)' marker", () => {
    expect(callSeconds("Call — completed (184s)")).toBe(184);
    expect(callSeconds("[Voicemail] left one")).toBe(0);
  });
});

describe("callStats over a week of activity", () => {
  it("classifies connects vs voicemails vs no-answers and sums talk time", () => {
    const acts = [
      call("Call — completed (120s)", 2), // connect, 2 min
      call("[Connected] Good talk — Next: comps", 5), // connect
      call(QUICK_OUTCOMES[0].line, 6), // no answer
      call(QUICK_OUTCOMES[1].line, 7), // voicemail
      call(QUICK_OUTCOMES[2].line, 8), // busy → no-answer bucket
      call("Call — voicemail (32s)", 26), // voicemail with talk seconds (the drop)
    ];
    const s = callStats(acts, 7, NOW);
    expect(s.dials).toBe(6);
    expect(s.connects).toBe(2);
    expect(s.voicemails).toBe(2);
    expect(s.noAnswers).toBe(2);
    expect(s.connectRate).toBeCloseTo(2 / 6, 3);
    expect(s.talkMinutes).toBeCloseTo(2.5, 1); // 120s + 32s
  });

  it("windows correctly: older calls, inbound calls, and non-calls don't count", () => {
    const acts = [
      call("Call — completed (60s)", 24 * 8), // 8 days ago — outside the 7d window
      call("Call — completed (60s)", 1, { direction: "inbound" } as Partial<Activity>), // received, not a dial
      { ...call("x", 1), kind: "email" } as Activity,
      call("[No answer] nope", 1),
    ];
    const s = callStats(acts, 7, NOW);
    expect(s.dials).toBe(1);
    expect(s.talkMinutes).toBe(0);
  });

  it("always returns a zero-filled 7-day series for the chart", () => {
    const s = callStats([], 7, NOW);
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay.every((d) => d.value === 0)).toBe(true);
    expect(s.dials).toBe(0);
    expect(s.connectRate).toBe(0);
  });

  it("buckets dials onto the right day", () => {
    const s = callStats([call("[Connected] hi — Next: x", 1), call("[No answer] z", 1)], 7, NOW);
    expect(s.perDay[6].value).toBe(2); // newest bucket = today
    expect(s.perDay.slice(0, 6).every((d) => d.value === 0)).toBe(true);
  });
});

describe("hour-window labels", () => {
  it("reads like a human wrote it, across noon and midnight", () => {
    expect(windowLabel(9)).toBe("9–10 AM");
    expect(windowLabel(11)).toBe("11 AM–12 PM");
    expect(windowLabel(12)).toBe("12–1 PM");
    expect(windowLabel(13)).toBe("1–2 PM");
    expect(windowLabel(23)).toBe("11 PM–12 AM");
    expect(windowLabel(0)).toBe("12–1 AM");
  });
});

describe("best time to call", () => {
  const CONNECT = "[Connected] good talk — Next: comps";
  const MISS = QUICK_OUTCOMES[0].line; // [No answer]
  // n dials in the given UTC hour (minute offsets keep timestamps unique),
  // the first `connects` of them connected.
  const block = (n: number, connects: number, hourUtc: number): Activity[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `d${hourUtc}-${i}`,
      kind: "call",
      direction: "outbound",
      summary: i < connects ? CONNECT : MISS,
      occurredAt: `2026-06-10T${String(hourUtc).padStart(2, "0")}:${String(i).padStart(2, "0")}:00Z`,
    }) as Activity);

  // 30 dials: 10am UTC runs 50%, 3pm runs 25%, 8pm never connects.
  const SAMPLE = [...block(10, 5, 10), ...block(12, 3, 15), ...block(8, 0, 20)];

  it("stays silent until there's enough signal (a thin sample would crown a fluke)", () => {
    const { best, sampleDials } = bestCallWindow(SAMPLE.slice(0, MIN_SAMPLE_DIALS - 1), 30, NOW);
    expect(best).toBeNull();
    expect(sampleDials).toBe(MIN_SAMPLE_DIALS - 1);
  });

  it("picks the hour with the best connect rate, skipping zero-connect hours", () => {
    const { best, sampleDials } = bestCallWindow(SAMPLE, 30, NOW);
    expect(sampleDials).toBe(30);
    expect(best?.hour).toBe(10);
    expect(best?.connectRate).toBeCloseTo(0.5, 3);
  });

  it("never crowns an hour below the per-hour dial minimum, even at a perfect rate", () => {
    const thinPerfect = block(MIN_WINDOW_DIALS - 1, MIN_WINDOW_DIALS - 1, 7); // 7/7 connects at 7am — too thin
    const { best } = bestCallWindow([...SAMPLE, ...thinPerfect], 30, NOW);
    expect(best?.hour).toBe(10);
  });

  it("buckets in the org's timezone — 10am UTC is the 6am hour in New York (June)", () => {
    const { best } = bestCallWindow(SAMPLE, 30, NOW, "America/New_York");
    expect(best?.hour).toBe(6);
  });

  it("breaks rate ties toward the bigger sample, then the earlier hour", () => {
    const moreDials = [...block(8, 4, 9), ...block(10, 5, 11), ...block(12, 0, 20)];
    expect(bestCallWindow(moreDials, 30, NOW).best?.hour).toBe(11); // same 50%, 11am has more dials
    const dead = [...block(8, 4, 9), ...block(8, 4, 11), ...block(14, 0, 20)];
    expect(bestCallWindow(dead, 30, NOW).best?.hour).toBe(9); // identical — earlier hour is the stable answer
  });

  it("ignores dials outside the trailing window", () => {
    const old = block(40, 20, 10).map((a) => ({ ...a, occurredAt: a.occurredAt!.replace("2026-06-10", "2026-04-01") }));
    const { best, sampleDials } = bestCallWindow(old, 30, NOW);
    expect(sampleDials).toBe(0);
    expect(best).toBeNull();
  });
});

describe("requestedCallbacks (the promises the digest must surface)", () => {
  const cb = (contactId: string, dueIso: string, occurredAt: string): Activity =>
    ({
      id: `t-${contactId}-${occurredAt}`,
      kind: "task",
      contactId,
      summary: `Retry call — attempt 2 of 4: they asked for a callback Fri, Jun 12, 3:00 PM. (due ${dueIso})`,
      occurredAt,
    }) as Activity;

  it("returns upcoming promises sorted by time, within the horizon and the 30-min grace", () => {
    const acts = [
      cb("late", "2026-06-12T18:00:00Z", at(2)), // 3h from NOW — included
      cb("soon", "2026-06-12T16:00:00Z", at(3)), // 1h from NOW — included, sorts first
      cb("past", "2026-06-12T10:00:00Z", at(8)), // 5h overdue — beyond grace
      cb("far", "2026-06-14T10:00:00Z", at(2)), // beyond the 24h horizon
    ];
    const got = requestedCallbacks(acts, NOW, 24);
    expect(got.map((g) => g.contactId)).toEqual(["soon", "late"]);
  });

  it("keeps a slightly-overdue promise visible (the 'you promised Dana 20 minutes ago' line)", () => {
    const got = requestedCallbacks([cb("dana", "2026-06-12T14:45:00Z", at(4))], NOW, 24);
    expect(got).toHaveLength(1);
  });

  it("newest booking per contact wins, matching the runner's superseding rule", () => {
    const acts = [
      cb("c1", "2026-06-12T20:00:00Z", at(1)), // newest first (re-booked to 8pm)
      cb("c1", "2026-06-12T17:00:00Z", at(5)), // superseded original
    ];
    const got = requestedCallbacks(acts, NOW, 24);
    expect(got).toHaveLength(1);
    expect(got[0].dueAt).toBe("2026-06-12T20:00:00.000Z");
  });

  it("drops a promise already answered by a later outbound call", () => {
    const acts = [
      call("Call — completed (90s)", 1, { contactId: "c2" } as Partial<Activity>), // called 1h ago
      cb("c2", "2026-06-12T18:00:00Z", at(3)), // booked 3h ago — consumed by the call above
    ];
    expect(requestedCallbacks(acts, NOW, 24)).toHaveLength(0);
  });

  it("ignores plain retry tasks — only prospect-requested callbacks are promises", () => {
    const retry = {
      id: "r1",
      kind: "task",
      contactId: "c3",
      summary: "Retry call — attempt 2 of 4: no pickup last time, best window is the afternoon (~3h). (due 2026-06-12T18:00:00Z)",
      occurredAt: at(2),
    } as Activity;
    expect(requestedCallbacks([retry], NOW, 24)).toHaveLength(0);
  });
});

describe("callsToday", () => {
  it("counts only today's outbound calls (not inbound, other kinds, or other days)", () => {
    const acts: Activity[] = [
      call("Call — completed", 1), // today
      call("Call — completed", 2), // today
      call("Call — completed", 1, { direction: "inbound" } as Partial<Activity>), // inbound, excluded
      { ...call("x", 1), kind: "email" } as Activity, // not a call
      call("Call — completed", 48), // 2 days ago, excluded
    ];
    expect(callsToday(acts, NOW)).toBe(2);
    expect(callsToday([], NOW)).toBe(0);
  });
});
