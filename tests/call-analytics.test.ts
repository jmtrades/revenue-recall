import { describe, it, expect } from "vitest";
import { callStats, callOutcomeOf, callSeconds } from "@/lib/calls/analytics";
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
