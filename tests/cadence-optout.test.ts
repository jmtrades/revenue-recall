import { describe, it, expect, beforeEach } from "vitest";
import { enroll, runDueSteps, listEnrollments } from "@/lib/cadence";
import { getProvider } from "@/lib/crm/registry";

// Fresh module state (separate file). Proves the cadence honors opt-outs:
// an enrolled deal whose contact unsubscribed is stopped on the next tick,
// never messaged again — consistent with Autopilot's guardrails.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SEQUENCE_AUTOPILOT;
});

describe("cadence honors opt-outs", () => {
  it("stops an enrolled deal once the contact hard opts out", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "Cadence OptOut", points: [{ channel: "email", value: "cadence.optout@example.com" }] });
    const opp = await provider.createOpportunity({ title: "OptOut deal", pipelineId: pipeline.id, stageId: stage.id, value: 1000, currency: "USD", contactId: contact.id });

    // They unsubscribed.
    await provider.logActivity({ opportunityId: opp.id, contactId: contact.id, kind: "email", summary: "please unsubscribe, do not contact me again", direction: "inbound", occurredAt: new Date().toISOString() });

    const r = await enroll("recall", `deal:${opp.id}`);
    expect(r.enrolled).toBe(1);

    const tick = await runDueSteps();
    expect(tick.stopped).toBeGreaterThanOrEqual(1);

    const stillActive = (await listEnrollments("active")).some((e) => e.dealId === opp.id);
    expect(stillActive).toBe(false);
  });
});
