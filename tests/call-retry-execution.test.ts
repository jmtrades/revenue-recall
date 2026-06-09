import { describe, it, expect, beforeEach } from "vitest";
import { parseRetryTask, runCallRetries, scheduleCallRetry } from "@/lib/calls";
import { createTask } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";

// No Supabase / no voice transport → built-in CRM; placeCall falls back to the
// "log" transport (status "logged"), which counts as placed for the loop.
beforeEach(() => {
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
});

describe("parseRetryTask", () => {
  it("round-trips the marker scheduleCallRetry writes", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "No Pickup", points: [{ channel: "phone", value: "+15550100200" }] });
    // First attempt already logged (the call that just failed).
    await p.logActivity({ contactId: c.id, kind: "call", direction: "outbound", summary: "no answer", occurredAt: new Date().toISOString() });
    const plan = await scheduleCallRetry({ contactId: c.id, outcome: "no-answer" });
    expect(plan?.retry).toBe(true);

    const acts = await p.listActivitiesByContact!(c.id);
    const task = acts.find((a) => a.kind === "task" && a.summary.startsWith("Retry call"));
    expect(task).toBeTruthy();
    const parsed = parseRetryTask(task!.summary);
    expect(parsed).toBeTruthy();
    expect(parsed!.attempt).toBeGreaterThanOrEqual(2);
    expect(new Date(parsed!.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects non-retry summaries", () => {
    expect(parseRetryTask("Follow up with Pat")).toBeNull();
    expect(parseRetryTask("Retry call — attempt 2 of 4: no due marker here.")).toBeNull();
  });
});

describe("runCallRetries", () => {
  it("does nothing unless the org enabled an auto call task (the opt-in gate)", async () => {
    const r = await runCallRetries();
    expect(r).toEqual({ due: 0, placed: 0, skipped: 0 });
  });

  it("places a due retry once, then treats it as consumed on the next tick", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Redial Me", points: [{ channel: "phone", value: "+15550100300" }] });
    await p.logActivity({ contactId: c.id, kind: "call", direction: "outbound", summary: "no answer", occurredAt: new Date(Date.now() - 7_200_000).toISOString() });
    // A retry scheduled 2h ago that is due NOW (waitHours elapsed).
    await p.logActivity({
      contactId: c.id,
      kind: "task",
      summary: `Retry call — attempt 2 of 4: no pickup last time, best window is the afternoon (~1h). (due ${new Date(Date.now() - 60_000).toISOString()})`,
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    // Opt in to autonomous calling.
    await createTask({ name: "Auto call retries", goal: "redial no-pickups", trigger: "daily", scope: "recall_queue", channel: "call", autonomy: "auto" });

    const first = await runCallRetries();
    expect(first.due).toBe(1);
    expect(first.placed).toBe(1);

    const acts = await p.listActivitiesByContact!(c.id);
    expect(acts.some((a) => a.kind === "call" && a.summary.includes("Autopilot retry call placed"))).toBe(true);

    const second = await runCallRetries();
    expect(second.placed).toBe(0); // the outbound call consumed the retry
    expect(second.skipped).toBeGreaterThanOrEqual(1);
  });

  it("never redials an opted-out contact", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Opted Out", points: [{ channel: "phone", value: "+15550100400" }], attributes: { optedOut: true } });
    await p.logActivity({
      contactId: c.id,
      kind: "task",
      summary: `Retry call — attempt 2 of 4: no pickup last time, best window is the morning (~1h). (due ${new Date(Date.now() - 60_000).toISOString()})`,
      occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const r = await runCallRetries();
    expect(r.placed).toBe(0);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
  });
});
