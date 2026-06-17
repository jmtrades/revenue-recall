import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

// CAN-SPAM requires a physical postal address in commercial email. The autopilot
// must not auto-send email without one — it holds for human review instead.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.COMPLIANCE_ADDRESS;
  delete process.env.EMAIL_DOMAIN_VERIFIED;
});
afterEach(() => {
  delete process.env.COMPLIANCE_ADDRESS;
  delete process.env.EMAIL_DOMAIN_VERIFIED;
});

function autoEmail(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage warmly.", trigger: "manual", scope: `deal:${dealId}`, channel: "email", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

async function emailDeal() {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "Email Test", points: [{ channel: "email", value: "canspam@example.com" }] });
  return provider.createOpportunity({ title: "Reconnect about the listing", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
}

describe("autopilot email compliance gates", () => {
  it("holds autonomous email for review when no postal address is on file (CAN-SPAM)", async () => {
    process.env.EMAIL_DOMAIN_VERIFIED = "true";
    const opp = await emailDeal();
    const run = await runTask(autoEmail(opp.id));
    expect(run.actions[0].result).toBe("drafted");
  });

  it("holds autonomous email when the sending domain isn't verified", async () => {
    process.env.COMPLIANCE_ADDRESS = "123 Test St, Austin, TX 78701";
    // EMAIL_DOMAIN_VERIFIED unset → held even with a postal address
    const opp = await emailDeal();
    const run = await runTask(autoEmail(opp.id));
    expect(run.actions[0].result).toBe("drafted");
  });

  it("sends autonomous email once address AND domain verification are in place", async () => {
    process.env.COMPLIANCE_ADDRESS = "123 Test St, Austin, TX 78701";
    process.env.EMAIL_DOMAIN_VERIFIED = "true";
    const opp = await emailDeal();
    const run = await runTask(autoEmail(opp.id));
    expect(["sent", "logged"]).toContain(run.actions[0].result);
  });
});
