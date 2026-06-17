import { describe, it, expect } from "vitest";
import { planDefaultAutopilot } from "@/lib/launch/autopilot-default";
import type { AgentTask } from "@/lib/agent/types";

const task = (over: Partial<AgentTask>): AgentTask => ({
  id: "t", name: "T", goal: "", trigger: "daily", scope: "recall_queue", channel: "call",
  autonomy: "auto", enabled: true, createdAt: "2026-06-17T00:00:00Z", ...over,
});

describe("planDefaultAutopilot", () => {
  it("creates the default when there's no matching task", () => {
    expect(planDefaultAutopilot([])).toEqual({ kind: "create" });
    // wrong channel/scope/autonomy don't count as a match
    expect(planDefaultAutopilot([task({ channel: "email" })])).toEqual({ kind: "create" });
    expect(planDefaultAutopilot([task({ autonomy: "review" })])).toEqual({ kind: "create" });
    expect(planDefaultAutopilot([task({ scope: "all_open" })])).toEqual({ kind: "create" });
  });

  it("no-ops when an enabled autonomous call task already runs", () => {
    expect(planDefaultAutopilot([task({ id: "x", enabled: true })])).toEqual({ kind: "noop" });
  });

  it("re-enables a matching disabled task instead of duplicating it", () => {
    expect(planDefaultAutopilot([task({ id: "old", enabled: false })])).toEqual({ kind: "enable", id: "old" });
  });

  it("prefers no-op over enable when both an enabled and disabled match exist", () => {
    expect(planDefaultAutopilot([task({ id: "off", enabled: false }), task({ id: "on", enabled: true })])).toEqual({ kind: "noop" });
  });
});
