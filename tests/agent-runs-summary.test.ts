import { describe, it, expect } from "vitest";
import { summarizeRuns } from "@/lib/agent/summary";
import type { AgentRun, AgentAction } from "@/lib/agent/types";

function action(dealId: string | undefined, result: AgentAction["result"], value?: number): AgentAction {
  return { type: "email", dealId, title: "t", detail: "d", result, source: "template", value };
}

function run(actions: AgentAction[]): AgentRun {
  return {
    id: Math.random().toString(36).slice(2),
    taskId: "task",
    status: "completed",
    summary: "",
    actions,
    itemsProcessed: actions.length,
    recoverable: actions.reduce((s, a) => s + (a.value ?? 0), 0),
    ai: false,
    startedAt: new Date().toISOString(),
  };
}

describe("summarizeRuns", () => {
  it("is all zeros with no runs (no divide-by-zero, no NaN)", () => {
    expect(summarizeRuns([])).toEqual({ actionsTaken: 0, dealsWorked: 0, recoverableTouched: 0 });
  });

  it("dedupes a deal touched across multiple runs — counts it once", () => {
    // Same deal worked in two runs would inflate a naive sum to 2 / $2000.
    const s = summarizeRuns([
      run([action("deal-1", "sent", 1000)]),
      run([action("deal-1", "sent", 1000)]),
    ]);
    expect(s.dealsWorked).toBe(1);
    expect(s.recoverableTouched).toBe(1000);
    expect(s.actionsTaken).toBe(2); // every touch still counts as an action
  });

  it("does not count skipped touches as worked (opted-out / quiet-hours evaluations)", () => {
    const s = summarizeRuns([
      run([action("deal-1", "sent", 500), action("deal-2", "skipped", 999)]),
    ]);
    expect(s.dealsWorked).toBe(1);
    expect(s.recoverableTouched).toBe(500);
    expect(s.actionsTaken).toBe(2);
  });

  it("sums distinct deals and ignores actions with no deal id", () => {
    const s = summarizeRuns([
      run([action("deal-1", "sent", 100), action("deal-2", "logged", 200)]),
      run([action("deal-3", "queued", 300), action(undefined, "logged", 9999)]),
    ]);
    expect(s.dealsWorked).toBe(3);
    expect(s.recoverableTouched).toBe(600);
  });
});
