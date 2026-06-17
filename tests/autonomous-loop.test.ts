import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

// End-to-end through the real built-in provider + agent engine (no AI key → human
// templates; no email provider → "log" transport). Proves the autonomous loop AND
// the recall thesis: a soft "no for now" is held then re-engaged, only a hard
// opt-out is permanent, and clean deals send.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AGENT_COOLDOWN_DAYS = "0"; // isolate the decline gate
  process.env.AGENT_DECLINE_COOLDOWN_DAYS = "30";
  process.env.COMPLIANCE_ADDRESS = "123 Test St, Austin, TX 78701"; // CAN-SPAM address on file so autonomous email can send
});
afterEach(() => {
  delete process.env.AGENT_COOLDOWN_DAYS;
  delete process.env.AGENT_DECLINE_COOLDOWN_DAYS;
  delete process.env.COMPLIANCE_ADDRESS;
});

async function freshDeal(emailLocal: string) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const openStage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: `E2E ${emailLocal}`, points: [{ channel: "email", value: `${emailLocal}@example.com` }] });
  const opp = await provider.createOpportunity({
    title: `E2E ${emailLocal} deal`,
    pipelineId: pipeline.id,
    stageId: openStage.id,
    value: 25000,
    currency: "USD",
    contactId: contact.id,
  });
  return { provider, opp, contact };
}

function autoEmail(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto outreach", goal: "Re-engage warmly.", trigger: "manual", scope: `deal:${dealId}`, channel: "email", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

describe("autonomous loop end-to-end", () => {
  it("sends to a clean open deal in auto mode", async () => {
    const { opp } = await freshDeal("clean");
    const run = await runTask(autoEmail(opp.id));
    const action = run.actions.find((a) => a.dealId === opp.id)!;
    expect(["sent", "logged"]).toContain(action.result);
    expect(run.summary).toMatch(/sent/);
  });

  it("holds (does not drop) a soft-declined deal, then re-engages after the cooldown", async () => {
    const { provider, opp } = await freshDeal("softno");
    // They said a soft no recently.
    await provider.logActivity({ opportunityId: opp.id, contactId: opp.contactId, kind: "email", summary: "not interested right now, maybe later", direction: "inbound", occurredAt: new Date().toISOString() });

    const held = await runTask(autoEmail(opp.id));
    const heldAction = held.actions.find((a) => a.dealId === opp.id)!;
    expect(heldAction.result).toBe("skipped");
    expect(heldAction.detail.toLowerCase()).toMatch(/re-engage|no for now|cooldown/);

    // After the re-engagement window, it follows up again (this is Revenue Recall).
    process.env.AGENT_DECLINE_COOLDOWN_DAYS = "0"; // window elapsed
    const resumed = await runTask(autoEmail(opp.id));
    const resumedAction = resumed.actions.find((a) => a.dealId === opp.id)!;
    expect(["sent", "logged"]).toContain(resumedAction.result);
  });

  it("permanently suppresses a hard opt-out", async () => {
    const { provider, opp } = await freshDeal("hardstop");
    await provider.logActivity({ opportunityId: opp.id, contactId: opp.contactId, kind: "email", summary: "please unsubscribe me, do not contact me again", direction: "inbound", occurredAt: new Date().toISOString() });

    const run = await runTask(autoEmail(opp.id));
    const action = run.actions.find((a) => a.dealId === opp.id)!;
    expect(action.result).toBe("skipped");
    expect(action.detail.toLowerCase()).toMatch(/opted out|stop/);

    // Even with the decline window disabled, a hard opt-out stays suppressed.
    process.env.AGENT_DECLINE_COOLDOWN_DAYS = "0";
    const again = await runTask(autoEmail(opp.id));
    expect(again.actions.find((a) => a.dealId === opp.id)!.result).toBe("skipped");
  });
});
