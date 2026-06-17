import { describe, it, expect, beforeEach, vi } from "vitest";

// Toggle the org's global kill switch via a mocked getOrgSettings (real env
// fallback + sendingPaused flipped), and prove autopilot holds vs sends.
const h = vi.hoisted(() => ({ paused: true }));
vi.mock("@/lib/org", async (orig) => {
  const actual = await orig<typeof import("@/lib/org")>();
  return { ...actual, getOrgSettings: async () => ({ ...(await actual.getOrgSettings()), sendingPaused: h.paused }) };
});

import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  process.env.COMPLIANCE_ADDRESS = "123 Test St, Austin, TX 78701"; // CAN-SPAM address on file so autonomous email can send
  process.env.EMAIL_DOMAIN_VERIFIED = "true"; // sending domain attested
});

function autoEmail(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel: "email", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

async function emailDeal() {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "Pause Test", points: [{ channel: "email", value: `pause${Date.now()}@example.com` }] });
  return provider.createOpportunity({ title: "Reconnect", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
}

describe("global pause-all kill switch", () => {
  it("holds every autonomous send while paused (drafts to Approvals, nothing sent)", async () => {
    h.paused = true;
    const opp = await emailDeal();
    const run = await runTask(autoEmail(opp.id));
    const r = run.actions[0].result;
    expect(r).not.toBe("sent");
    expect(r).not.toBe("logged");
    expect(["drafted", "queued"]).toContain(r);
  });

  it("sends normally once resumed", async () => {
    h.paused = false;
    const opp = await emailDeal();
    const run = await runTask(autoEmail(opp.id));
    expect(["sent", "logged"]).toContain(run.actions[0].result);
  });
});
