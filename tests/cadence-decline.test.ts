import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enroll, runDueSteps, listEnrollments } from "@/lib/cadence";
import { getProvider } from "@/lib/crm/registry";

// Fresh module state (separate file). Proves the cadence pauses its drip while a
// soft "not now" decline is within the re-engagement cooldown — instead of
// dripping a prospect who just said they're not interested right now.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.SEQUENCE_AUTOPILOT = "true";
  process.env.AGENT_DECLINE_COOLDOWN_DAYS = "30";
});
afterEach(() => {
  delete process.env.SEQUENCE_AUTOPILOT;
  delete process.env.AGENT_DECLINE_COOLDOWN_DAYS;
});

describe("cadence pauses on a soft decline", () => {
  it("skips a step (without advancing or stopping) during the decline cooldown", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "Soft Decline", points: [{ channel: "email", value: "soft.decline@example.com" }] });
    const opp = await provider.createOpportunity({ title: "Declined deal", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });

    // A recent SOFT decline (not a hard opt-out) — winnable later, paused now.
    await provider.logActivity({ opportunityId: opp.id, contactId: contact.id, kind: "email", summary: "not interested right now", direction: "inbound", occurredAt: new Date().toISOString() });

    const r = await enroll("recall", `deal:${opp.id}`);
    expect(r.enrolled).toBe(1);

    const tick = await runDueSteps();
    expect(tick.sent).toBe(0); // nothing sent to a just-declined prospect
    expect(tick.skipped).toBeGreaterThanOrEqual(1);

    // Still enrolled and still on step 0 — paused, not advanced and not stopped
    // (a hard opt-out would stop it; a soft decline only pauses).
    const active = await listEnrollments("active");
    expect(active.find((e) => e.dealId === opp.id)?.stepIndex).toBe(0);
  });
});
