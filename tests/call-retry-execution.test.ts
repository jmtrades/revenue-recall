import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseRetryTask, runCallRetries, scheduleCallRetry } from "@/lib/calls";
import { createTask } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";

// No Supabase / no voice transport → built-in CRM; placeCall falls back to the
// "log" transport (status "logged"), which counts as placed for the loop.
beforeEach(() => {
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
});

afterEach(() => {
  vi.useRealTimers();
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
    // Unknown-zone numbers now gate on the org clock (no more fail-open), so the
    // fixture pins a mapped area code (212 → New York) at a mid-window moment.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T16:00:00Z")); // 12:00 in New York
    const p = getProvider();
    const c = await p.createContact({ name: "Redial Me", points: [{ channel: "phone", value: "+12125550300" }] });
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

  it("holds a due retry at dawn in the PROSPECT's timezone, then places it when their window opens", async () => {
    const p = getProvider();
    // 415 → America/Los_Angeles. The org clock can't see this — that's the point.
    const c = await p.createContact({ name: "West Coast", points: [{ channel: "phone", value: "+14155550199" }] });
    await p.logActivity({ contactId: c.id, kind: "call", direction: "outbound", summary: "no answer", occurredAt: "2026-06-12T09:00:00Z" });
    await p.logActivity({
      contactId: c.id,
      kind: "task",
      summary: "Retry call — attempt 2 of 4: no pickup last time, best window is the morning (~1h). (due 2026-06-12T11:00:00Z)",
      occurredAt: "2026-06-12T10:00:00Z",
    });
    await createTask({ name: "Auto call retries", goal: "redial no-pickups", trigger: "daily", scope: "recall_queue", channel: "call", autonomy: "auto" });

    const dawn = await runCallRetries(new Date("2026-06-12T12:00:00Z")); // due, but 5am in San Francisco
    expect(dawn.skipped).toBeGreaterThanOrEqual(1);
    let acts = await p.listActivitiesByContact!(c.id);
    expect(acts.some((a) => a.summary.includes("Autopilot retry call placed"))).toBe(false);

    // Skipping left the task due — the next tick inside their window dials.
    const open = await runCallRetries(new Date("2026-06-12T16:00:00Z")); // 9am in San Francisco
    expect(open.placed).toBeGreaterThanOrEqual(1);
    acts = await p.listActivitiesByContact!(c.id);
    expect(acts.some((a) => a.summary.includes("Autopilot retry call placed"))).toBe(true);
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
