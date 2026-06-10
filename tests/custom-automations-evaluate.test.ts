import { describe, it, expect } from "vitest";
import { matchesConditions, triggerMatches, rulesToFire } from "@/lib/automations/custom-evaluate";
import type { CustomAutomation } from "@/lib/automations/custom-types";
import type { Opportunity, Stage } from "@/lib/crm/types";

function opp(p: Partial<Opportunity> = {}): Opportunity {
  return { id: "o1", title: "Acme — 50 seats", pipelineId: "p1", stageId: "s1", value: 5000, currency: "USD", contactId: "c1", source: "Web form", createdAt: "", updatedAt: "", ...p };
}
const won: Stage = { id: "w", label: "Won", probability: 1, type: "won" };
const lost: Stage = { id: "l", label: "Lost", probability: 0, type: "lost" };
const openS1: Stage = { id: "s1", label: "Proposal", probability: 0.4, type: "open" };
const openS2: Stage = { id: "s2", label: "Negotiation", probability: 0.6, type: "open" };

describe("matchesConditions", () => {
  it("compares numeric value with the ordering ops", () => {
    expect(matchesConditions(opp(), [{ field: "value", op: "gt", value: 1000 }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "value", op: "lt", value: 1000 }])).toBe(false);
    expect(matchesConditions(opp(), [{ field: "value", op: "gte", value: 5000 }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "value", op: "eq", value: 5000 }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "value", op: "contains", value: 5 }])).toBe(false); // nonsensical → false
  });

  it("compares string fields case-insensitively with eq / contains", () => {
    expect(matchesConditions(opp(), [{ field: "source", op: "eq", value: "web form" }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "source", op: "contains", value: "WEB" }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "source", op: "eq", value: "phone" }])).toBe(false);
    expect(matchesConditions(opp(), [{ field: "pipeline", op: "eq", value: "p1" }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "source", op: "gt", value: 3 }])).toBe(false); // numeric op on string → false
  });

  it("ANDs multiple conditions; an empty list matches everything", () => {
    expect(matchesConditions(opp(), [{ field: "value", op: "gt", value: 1000 }, { field: "source", op: "contains", value: "web" }])).toBe(true);
    expect(matchesConditions(opp(), [{ field: "value", op: "gt", value: 1000 }, { field: "source", op: "eq", value: "phone" }])).toBe(false);
    expect(matchesConditions(opp(), [])).toBe(true);
  });
});

function rule(p: Partial<CustomAutomation> = {}): CustomAutomation {
  return { id: "r1", name: "R", triggerKind: "deal_won", conditions: [], actions: [{ type: "notify_owner" }], enabled: true, ...p };
}

describe("triggerMatches", () => {
  it("matches won/lost by stage type", () => {
    expect(triggerMatches(rule({ triggerKind: "deal_won" }), won)).toBe(true);
    expect(triggerMatches(rule({ triggerKind: "deal_won" }), openS1)).toBe(false);
    expect(triggerMatches(rule({ triggerKind: "deal_lost" }), lost)).toBe(true);
  });

  it("stage_changed matches any open move, or one stage when narrowed", () => {
    expect(triggerMatches(rule({ triggerKind: "stage_changed" }), openS1)).toBe(true);
    expect(triggerMatches(rule({ triggerKind: "stage_changed" }), won)).toBe(false); // won has its own trigger
    expect(triggerMatches(rule({ triggerKind: "stage_changed", stageId: "s2" }), openS2)).toBe(true);
    expect(triggerMatches(rule({ triggerKind: "stage_changed", stageId: "s2" }), openS1)).toBe(false);
  });
});

describe("rulesToFire", () => {
  it("keeps only enabled rules whose trigger and conditions match", () => {
    const rules: CustomAutomation[] = [
      rule({ id: "a", triggerKind: "deal_won", conditions: [{ field: "value", op: "gte", value: 1000 }] }), // fires
      rule({ id: "b", triggerKind: "deal_won", conditions: [{ field: "value", op: "gt", value: 99999 }] }), // condition fails
      rule({ id: "c", triggerKind: "deal_lost" }), // wrong trigger for a win
      rule({ id: "d", triggerKind: "deal_won", enabled: false }), // disabled
    ];
    expect(rulesToFire(rules, opp(), won).map((r) => r.id)).toEqual(["a"]);
  });
});
