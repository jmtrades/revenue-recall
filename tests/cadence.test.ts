import { describe, it, expect, beforeEach } from "vitest";
import { enroll, runDueSteps, listEnrollments } from "@/lib/cadence";
import { listOutbox } from "@/lib/agent/store";

// No AI key + no Supabase → template drafting + in-memory store (built-in CRM).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SEQUENCE_AUTOPILOT;
});

describe("cadence runtime", () => {
  it("enrolls the recall queue and queues the first due step to Approvals", async () => {
    const before = (await listOutbox("pending")).length;

    const r = await enroll("recall", "recall_queue");
    expect(r.enrolled).toBeGreaterThan(0);

    const active = await listEnrollments("active");
    expect(active.length).toBe(r.enrolled);
    expect(active.every((e) => e.stepIndex === 0)).toBe(true);

    // The recall sequence's first step is an email on day 0 → due immediately.
    const tick = await runDueSteps();
    expect(tick.due).toBe(r.enrolled);
    expect(tick.processed).toBe(r.enrolled);
    expect(tick.queued).toBe(r.enrolled); // review mode → Approvals, not auto-sent

    const after = (await listOutbox("pending")).length;
    expect(after).toBe(before + r.enrolled);

    // Every enrollment advanced to the next step and stays active.
    const advanced = await listEnrollments("active");
    expect(advanced.length).toBe(r.enrolled);
    expect(advanced.every((e) => e.stepIndex === 1)).toBe(true);
  });

  it("does not re-enroll a deal that's already active in the sequence", async () => {
    const r = await enroll("recall", "recall_queue");
    expect(r.enrolled).toBe(0);
    expect(r.skipped).toBeGreaterThan(0);
  });

  it("does not process a step before it's due", async () => {
    // Step 2 (call) isn't due until day 3; running 'now' should find nothing due.
    const tick = await runDueSteps();
    expect(tick.due).toBe(0);
    expect(tick.processed).toBe(0);
  });

  it("advances through every step and completes the enrollment", async () => {
    const future = () => new Date(Date.now() + 60 * 86400000).toISOString();
    let active = await listEnrollments("active");
    expect(active.length).toBeGreaterThan(0);

    let guard = 0;
    while (active.length > 0 && guard++ < 10) {
      const tick = await runDueSteps(future());
      expect(tick.processed).toBe(tick.due);
      active = await listEnrollments("active");
    }

    expect(active.length).toBe(0);
    const completed = await listEnrollments("completed");
    expect(completed.length).toBeGreaterThan(0);
  });
});
