import { describe, it, expect } from "vitest";
import { countDialsToday } from "@/lib/queries";
import type { Activity } from "@/lib/crm/types";

function act(partial: Partial<Activity>): Activity {
  return { id: "a", kind: "call", direction: "outbound", summary: "", occurredAt: new Date().toISOString(), ...partial } as Activity;
}

describe("countDialsToday — the dial-pace pulse", () => {
  const now = new Date("2026-06-11T15:00:00Z");
  const todayIso = "2026-06-11T09:30:00Z";
  const yesterdayIso = "2026-06-10T23:30:00Z";

  it("counts today's outbound calls (real dials + one-tap no-connects both log a call)", () => {
    const acts = [
      act({ occurredAt: todayIso }),
      act({ occurredAt: todayIso }),
      act({ occurredAt: yesterdayIso }), // not today
    ];
    expect(countDialsToday(acts, now)).toBe(2);
  });

  it("ignores inbound calls, non-call activity, and undated rows", () => {
    const acts = [
      act({ occurredAt: todayIso, direction: "inbound" }), // a received call isn't a dial
      act({ occurredAt: todayIso, kind: "email" }), // not a call
      act({ occurredAt: todayIso, kind: "sms" }),
      act({ occurredAt: undefined as unknown as string }),
      act({ occurredAt: todayIso }), // the only real dial
    ];
    expect(countDialsToday(acts, now)).toBe(1);
  });

  it("is zero on an empty feed", () => {
    expect(countDialsToday([], now)).toBe(0);
  });
});
