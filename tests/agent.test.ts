import { describe, it, expect, beforeEach } from "vitest";
import { createTask, listOutbox } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";
import { listRecallTouches, __resetRecallEventsForTests } from "@/lib/recall/events";

// No AI key + no Supabase env → template drafting + in-memory store (built-in CRM).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  __resetRecallEventsForTests();
});

describe("autopilot engine", () => {
  it("works the recall queue and records a drafted action per deal (review mode)", async () => {
    const task = await createTask({
      name: "Re-engage cold deals",
      goal: "Reach out warmly and offer a quick call.",
      scope: "recall_queue",
      channel: "email",
      autonomy: "review",
    });
    const run = await runTask(task);

    expect(run.status).toBe("completed");
    expect(run.itemsProcessed).toBeGreaterThan(0);
    expect(run.actions.length).toBe(run.itemsProcessed);
    expect(run.actions.every((a) => a.result === "drafted")).toBe(true);
    expect(run.actions.every((a) => a.source === "template")).toBe(true);
    expect(run.summary).toMatch(/prepared/);
  });

  it("queues review-mode email drafts to the approval inbox with full bodies", async () => {
    const task = await createTask({ name: "Approve me", goal: "Re-engage.", scope: "recall_queue", channel: "email", autonomy: "review" });
    const run = await runTask(task);
    const pending = await listOutbox("pending");
    const fromRun = pending.filter((p) => p.runId === run.id);
    expect(fromRun.length).toBe(run.itemsProcessed);
    expect(fromRun.every((p) => p.body.length > 0 && p.status === "pending")).toBe(true);
  });

  it("produces recommendation-only actions for the 'none' channel", async () => {
    const task = await createTask({ name: "Triage", goal: "Suggest next steps.", scope: "recall_queue", channel: "none" });
    const run = await runTask(task);
    expect(run.actions.every((a) => a.type === "recommend")).toBe(true);
    expect(run.actions.every((a) => a.result === "queued")).toBe(true);
  });

  it("records a recall touch for autopilot sends on at-risk deals (ROI attribution)", async () => {
    const task = await createTask({
      name: "Auto-recall",
      goal: "Re-engage cold deals.",
      scope: "recall_queue",
      channel: "email",
      autonomy: "auto",
    });
    const run = await runTask(task);
    const sent = run.actions.filter((a) => a.result === "sent" || a.result === "logged");
    const touches = await listRecallTouches();
    // Every successful autopilot send on a recall-queue deal is attributed.
    expect(touches.length).toBe(sent.length);
    expect(touches.length).toBeGreaterThan(0);
    expect(touches.every((t) => t.source === "autopilot")).toBe(true);
  });
});
