import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomAutomation } from "@/lib/automations/custom-types";
import type { Opportunity, Stage } from "@/lib/crm/types";

/**
 * runCustomDealAutomations executor. The store + the safe action primitives are
 * mocked so we can assert exactly what each rule does, in isolation. The whole
 * call must never throw.
 */
const h = vi.hoisted(() => ({
  rules: [] as CustomAutomation[],
  tasks: [] as Array<{ title: string; due: string | null }>,
  enrolls: [] as Array<{ seq: string; scope: string }>,
  emails: [] as Array<{ to: string; subject: string }>,
  failTask: false,
}));

vi.mock("@/lib/automations/custom-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/automations/custom-store")>()),
  listEnabledCustomAutomations: vi.fn(async () => h.rules),
}));
vi.mock("@/lib/tasks/manual", async (orig) => ({
  ...(await orig<typeof import("@/lib/tasks/manual")>()),
  createManualTask: vi.fn(async (title: string, due: string | null) => {
    if (h.failTask) throw new Error("no db");
    h.tasks.push({ title, due: due ?? null });
    return {} as never;
  }),
}));
vi.mock("@/lib/cadence", async (orig) => ({
  ...(await orig<typeof import("@/lib/cadence")>()),
  enroll: vi.fn(async (seq: string, scope: string) => {
    h.enrolls.push({ seq, scope });
    return { enrolled: 1, skipped: 0, enrollments: [] };
  }),
}));
vi.mock("@/lib/comms", async (orig) => ({
  ...(await orig<typeof import("@/lib/comms")>()),
  sendEmail: vi.fn(async (to: string, subject: string) => {
    h.emails.push({ to, subject });
    return { id: "e", status: "logged", provider: "log" };
  }),
}));
vi.mock("@/lib/billing/lifecycle", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/lifecycle")>()),
  ownerEmailsForOrg: vi.fn(async () => ["owner@x.com"]),
}));
vi.mock("@/lib/supabase/active-org", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/active-org")>()),
  resolveActiveOrgId: vi.fn(async () => "org_1"),
}));

import { runCustomDealAutomations } from "@/lib/automations/run-custom";

function opp(p: Partial<Opportunity> = {}): Opportunity {
  return { id: "o1", title: "Acme — 50 seats", pipelineId: "p1", stageId: "s1", value: 5000, currency: "USD", contactId: "c1", source: "Web form", createdAt: "", updatedAt: "", ...p };
}
const won: Stage = { id: "w", label: "Won", probability: 1, type: "won" };
const lost: Stage = { id: "l", label: "Lost", probability: 0, type: "lost" };
const open: Stage = { id: "s1", label: "Proposal", probability: 0.4, type: "open" };

function rule(p: Partial<CustomAutomation>): CustomAutomation {
  return { id: "r1", name: "R", triggerKind: "deal_won", conditions: [], actions: [], enabled: true, ...p };
}

beforeEach(() => {
  h.rules = [];
  h.tasks = [];
  h.enrolls = [];
  h.emails = [];
  h.failTask = false;
});

describe("runCustomDealAutomations", () => {
  it("creates a task (title rendered with the deal, due honored) on a matching won rule", async () => {
    h.rules = [rule({ triggerKind: "deal_won", actions: [{ type: "create_task", title: "Send contract", dueInDays: 2 }] })];
    await runCustomDealAutomations(opp(), won);
    expect(h.tasks).toHaveLength(1);
    expect(h.tasks[0].title).toMatch(/Send contract — Acme/);
    expect(h.tasks[0].due).toBeTruthy();
  });

  it("enrolls a sequence scoped to the deal when conditions pass", async () => {
    h.rules = [rule({ triggerKind: "stage_changed", stageId: null, conditions: [{ field: "value", op: "gte", value: 1000 }], actions: [{ type: "enroll_sequence", sequenceId: "seq_1" }] })];
    await runCustomDealAutomations(opp({ value: 5000 }), open);
    expect(h.enrolls).toEqual([{ seq: "seq_1", scope: "deal:o1" }]);
  });

  it("notifies the owner on a matching lost rule", async () => {
    h.rules = [rule({ triggerKind: "deal_lost", actions: [{ type: "notify_owner", message: "Big one got away" }] })];
    await runCustomDealAutomations(opp(), lost);
    expect(h.emails.some((e) => e.to === "owner@x.com" && /Automation:/.test(e.subject))).toBe(true);
  });

  it("does nothing when conditions don't match", async () => {
    h.rules = [rule({ triggerKind: "deal_won", conditions: [{ field: "value", op: "gt", value: 99999 }], actions: [{ type: "create_task", title: "X" }] })];
    await runCustomDealAutomations(opp({ value: 5000 }), won);
    expect(h.tasks).toHaveLength(0);
  });

  it("does nothing for a non-matching trigger", async () => {
    h.rules = [rule({ triggerKind: "deal_lost", actions: [{ type: "create_task", title: "X" }] })];
    await runCustomDealAutomations(opp(), won); // a WIN shouldn't fire a lost rule
    expect(h.tasks).toHaveLength(0);
  });

  it("never throws — an action failure can't block the move, and other actions still run", async () => {
    h.failTask = true;
    h.rules = [rule({ triggerKind: "deal_won", actions: [{ type: "create_task", title: "X" }, { type: "enroll_sequence", sequenceId: "seq_1" }] })];
    await expect(runCustomDealAutomations(opp(), won)).resolves.toBeUndefined();
    // The task threw, but the sequence enroll still happened.
    expect(h.enrolls).toEqual([{ seq: "seq_1", scope: "deal:o1" }]);
  });

  it("no-ops cleanly with no rules", async () => {
    await runCustomDealAutomations(opp(), won);
    expect(h.tasks).toHaveLength(0);
    expect(h.emails).toHaveLength(0);
  });
});
