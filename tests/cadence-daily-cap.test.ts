import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enroll, runDueSteps, listEnrollments } from "@/lib/cadence";

// Fresh module state (separate file). Proves the sequence/cadence engine shares
// Autopilot's daily send cap, so a large enrolled sequence can't blow past the
// limit in one run — the gap that previously let cadence send unbounded.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  process.env.SEQUENCE_AUTOPILOT = "true";
  process.env.AGENT_DAILY_SEND_CAP = "1";
});
afterEach(() => {
  delete process.env.SEQUENCE_AUTOPILOT;
  delete process.env.AGENT_DAILY_SEND_CAP;
});

describe("cadence respects the shared daily send cap", () => {
  it("sends only up to the cap and leaves the rest due (not advanced)", async () => {
    const r = await enroll("recall", "recall_queue");
    expect(r.enrolled).toBeGreaterThanOrEqual(2); // need >1 enrolled to observe a cap of 1

    const tick = await runDueSteps();
    expect(tick.sent).toBe(1); // cap = 1
    expect(tick.skipped).toBe(r.enrolled - 1); // the rest held, uncounted as sent/queued

    // The capped steps did NOT advance — they retry on a later tick once back
    // under the rolling-24h cap, instead of all firing at once.
    const active = await listEnrollments("active");
    expect(active.filter((e) => e.stepIndex === 0).length).toBe(r.enrolled - 1);
  });
});
