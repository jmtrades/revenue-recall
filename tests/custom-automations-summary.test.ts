import { describe, it, expect } from "vitest";
import { summarizeRule, triggerLabel } from "@/lib/automations/custom-summary";
import type { CustomAutomation } from "@/lib/automations/custom-types";

function rule(p: Partial<CustomAutomation>): CustomAutomation {
  return { id: "r1", name: "R", triggerKind: "deal_won", conditions: [], actions: [], enabled: true, ...p };
}

const labels = { stage: (id: string) => (id === "s2" ? "Negotiation" : id), sequence: (id: string) => (id === "seq_1" ? "Win-back" : id) };

describe("summarizeRule", () => {
  it("renders trigger + conditions + actions in plain English", () => {
    const r = rule({
      triggerKind: "deal_won",
      conditions: [{ field: "value", op: "gte", value: 5000 }],
      actions: [{ type: "create_task", title: "Send contract", dueInDays: 2 }, { type: "notify_owner" }],
    });
    expect(summarizeRule(r, labels)).toBe('Deal won when value ≥ 5000 → create task "Send contract" (due +2d), notify the owner');
  });

  it("labels a stage-narrowed trigger and a sequence action via the lookups", () => {
    const r = rule({ triggerKind: "stage_changed", stageId: "s2", actions: [{ type: "enroll_sequence", sequenceId: "seq_1" }] });
    expect(summarizeRule(r, labels)).toBe("Deal moves to Negotiation → enroll in Win-back");
  });

  it("handles no conditions and an any-stage move", () => {
    expect(triggerLabel(rule({ triggerKind: "stage_changed" }))).toBe("Deal changes stage");
    expect(summarizeRule(rule({ triggerKind: "deal_lost", actions: [{ type: "notify_owner" }] }))).toBe("Deal lost → notify the owner");
  });

  it("describes a contains condition naturally", () => {
    const r = rule({ triggerKind: "deal_won", conditions: [{ field: "source", op: "contains", value: "web" }], actions: [{ type: "notify_owner" }] });
    expect(summarizeRule(r)).toBe('Deal won when source contains "web" → notify the owner');
  });
});
