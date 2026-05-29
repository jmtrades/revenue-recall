import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isEntitled, enforcementOn } from "@/lib/billing/enforce";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
});
afterEach(() => {
  delete process.env.BILLING_ENFORCE;
});

describe("billing enforcement flag", () => {
  it("everything is entitled when enforcement is off (demo/trial-friendly)", async () => {
    expect(enforcementOn()).toBe(false);
    expect(await isEntitled("autopilot")).toBe(true);
    expect(await isEntitled("aiLive")).toBe(true);
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
