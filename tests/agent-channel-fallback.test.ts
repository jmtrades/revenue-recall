import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

// No AI key → template drafting; logged transports (no provider keys set).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
});

async function autoTask(channel: AgentTask["channel"], dealId: string): Promise<AgentTask> {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel, autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

describe("autopilot channel fallback (auto mode)", () => {
  it("reaches a phone-only contact over SMS when the task asked for email", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    // No email on file — only a phone number.
    const contact = await provider.createContact({ name: "Phone Only", points: [{ channel: "phone", value: "+15551230000" }] });
    const opp = await provider.createOpportunity({ title: "Reachable deal", pipelineId: pipeline.id, stageId: stage.id, value: 4200, currency: "USD", contactId: contact.id });

    const run = await runTask(await autoTask("email", opp.id));
    const action = run.actions[0];
    // Instead of a wasted skip, the touch went out on a channel we can actually reach.
    expect(action.type).toBe("sms");
    expect(action.result).not.toBe("skipped");
    expect(["sent", "logged"]).toContain(action.result);
  });

  it("still skips when there is no way to reach them at all", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "Unreachable", points: [] });
    const opp = await provider.createOpportunity({ title: "No contact point", pipelineId: pipeline.id, stageId: stage.id, value: 1000, currency: "USD", contactId: contact.id });

    const run = await runTask(await autoTask("email", opp.id));
    expect(run.actions[0].result).toBe("skipped");
  });
});
