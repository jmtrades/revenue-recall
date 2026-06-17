import { describe, it, expect } from "vitest";
import { recentAgentActivity, resultLabel } from "@/lib/agent/activity";
import type { AgentRun, AgentAction } from "@/lib/agent/types";

const action = (over: Partial<AgentAction>): AgentAction => ({
  type: "call", title: "Lead", detail: "about a deal", result: "sent", source: "ai", ...over,
});
const run = (over: Partial<AgentRun>): AgentRun => ({
  id: "r", taskId: "t", status: "completed", summary: "", actions: [], itemsProcessed: 0, recoverable: 0, ai: true,
  startedAt: "2026-06-17T09:00:00Z", finishedAt: "2026-06-17T09:01:00Z", ...over,
});

describe("recentAgentActivity", () => {
  it("flattens actions across runs, newest-first, and caps at the limit", () => {
    const items = recentAgentActivity([
      run({ finishedAt: "2026-06-17T08:00:00Z", actions: [action({ title: "Older" })] }),
      run({ finishedAt: "2026-06-17T10:00:00Z", actions: [action({ title: "Newer" }), action({ title: "AlsoNewer", type: "sms" })] }),
    ], 2);
    expect(items).toHaveLength(2); // capped
    expect(items[0].title).toBe("Newer"); // newest run's actions first
    expect(items.every((i) => i.at === "2026-06-17T10:00:00Z")).toBe(true);
  });

  it("falls back to startedAt when a run hasn't finished", () => {
    const [item] = recentAgentActivity([run({ finishedAt: undefined, startedAt: "2026-06-17T07:00:00Z", actions: [action({})] })]);
    expect(item.at).toBe("2026-06-17T07:00:00Z");
  });

  it("is empty when no runs have actions", () => {
    expect(recentAgentActivity([run({ actions: [] })])).toEqual([]);
  });
});

describe("resultLabel", () => {
  it("reads as a human action, not a status code", () => {
    expect(resultLabel("call", "sent")).toBe("Called");
    expect(resultLabel("sms", "sent")).toBe("Texted");
    expect(resultLabel("email", "logged")).toBe("Emailed (logged)");
    expect(resultLabel("call", "queued")).toBe("Queued for your approval");
    expect(resultLabel("call", "skipped")).toBe("Skipped");
    expect(resultLabel("email", "drafted")).toBe("Draft ready");
  });
});
