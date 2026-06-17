import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isEntitled, enforcementOn } from "@/lib/billing/enforce";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import { draftMessage, type DraftInput } from "@/lib/ai/draft";
import { draftReply, type ReplyInput } from "@/lib/ai/reply";
import type { AgentTask } from "@/lib/agent/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.COMPLIANCE_ADDRESS = "123 Test St, Austin, TX 78701"; // CAN-SPAM address on file so autonomous email can send
});
afterEach(() => {
  delete process.env.BILLING_ENFORCE;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.COMPLIANCE_ADDRESS;
});

describe("billing enforcement flag", () => {
  it("everything is entitled when enforcement is off (no billing = demo/trial)", async () => {
    expect(enforcementOn()).toBe(false);
    expect(await isEntitled("autopilot")).toBe(true);
    expect(await isEntitled("aiLive")).toBe(true);
  });

  it("auto-enforces the moment Stripe billing is connected (margin-safe default)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; // billing connected, no explicit flag
    expect(enforcementOn()).toBe(true);
    expect(await isEntitled("aiLive")).toBe(false); // free plan no longer gets unlimited live AI
    expect(await isEntitled("autopilot")).toBe(false);
  });

  it("explicit BILLING_ENFORCE=false overrides even with Stripe connected", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.BILLING_ENFORCE = "false";
    expect(enforcementOn()).toBe(false);
  });

  it("gates paid features when enforcement is on and the org is free", async () => {
    process.env.BILLING_ENFORCE = "true";
    expect(await isEntitled("autopilot")).toBe(false); // free plan default
    expect(await isEntitled("integrations")).toBe(false);
  });
});

async function autoEmailTask(): Promise<AgentTask> {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "Gate Tester", points: [{ channel: "email", value: "gate@example.com" }] });
  const opp = await provider.createOpportunity({ title: "Gate deal", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
  return { id: `t_${opp.id}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${opp.id}`, channel: "email", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

describe("autopilot honors enforcement", () => {
  it("free org under enforcement drafts instead of auto-sending", async () => {
    process.env.BILLING_ENFORCE = "true";
    const run = await runTask(await autoEmailTask());
    // Downgraded to review → drafted/queued, nothing sent.
    expect(run.summary).toMatch(/prepared/);
    expect(run.actions.every((a) => a.result !== "sent")).toBe(true);
  });

  it("without enforcement, the same auto task sends (logged transport)", async () => {
    const run = await runTask(await autoEmailTask());
    const action = run.actions[0];
    expect(["sent", "logged"]).toContain(action.result);
  });
});

describe("aiLive entitlement gates live drafting", () => {
  const draftInput: DraftInput = {
    channel: "email",
    contactName: "Dana Lee",
    dealTitle: "Roof replacement",
    valueLabel: "Deal value",
    value: 12000,
    currency: "USD",
    stageLabel: "Proposal",
    industryLabel: "Home Services",
    industryId: "home_services",
  };
  const replyInput: ReplyInput = {
    channel: "email",
    contactName: "Dana Lee",
    dealTitle: "Roof replacement",
    incoming: "Is the quote still good?",
    industryId: "home_services",
  };

  it("falls back to templates for a free org when enforcement is on", async () => {
    process.env.BILLING_ENFORCE = "true";
    // Even if a key were present, the unentitled plan must not spend on a model.
    expect(await isEntitled("aiLive")).toBe(false);
    expect((await draftMessage(draftInput)).source).toBe("template");
    expect((await draftReply(replyInput)).source).toBe("template");
  });

  it("does not block drafting when enforcement is off", async () => {
    // No key in tests, so the result is still a template — but via the
    // isAiConfigured() path, not the entitlement gate (which is open here).
    expect(await isEntitled("aiLive")).toBe(true);
    expect((await draftMessage(draftInput)).source).toBe("template");
  });
});
