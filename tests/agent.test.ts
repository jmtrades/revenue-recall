import { describe, it, expect, beforeEach } from "vitest";
import { createTask } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";

// No AI key + no Supabase env → template drafting + in-memory store (built-in CRM).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
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

  it("produces recommendation-only actions for the 'none' channel", async () => {
    const task = await createTask({ name: "Triage", goal: "Suggest next steps.", scope: "recall_queue", channel: "none" });
    const run = await runTask(task);
    expect(run.actions.every((a) => a.type === "recommend")).toBe(true);
    expect(run.actions.every((a) => a.result === "queued")).toBe(true);
  });
});
