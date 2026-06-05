import { describe, it, expect, beforeEach } from "vitest";
import { enroll, runDueSteps, __resetEnrollmentsForTests } from "@/lib/cadence";
import { getSequence } from "@/lib/sequences";
import { getProvider } from "@/lib/crm/registry";
import { listOutbox } from "@/lib/agent/store";

// No AI key + no autopilot → drafts use the deterministic templates and queue to
// Approvals, so we can read the queued copy back and prove the LAST recall step
// is drafted as a gracious breakup (not a generic follow-up).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SEQUENCE_AUTOPILOT;
  __resetEnrollmentsForTests();
});

const BREAKUP = /stop chasing|clogging your inbox|last one for now|close this out|now's not the moment/i;

describe("recall cadence ends on a gracious breakup", () => {
  it("tags the final recall step as a breakup", () => {
    const recall = getSequence("recall")!;
    expect(recall.steps[recall.steps.length - 1].scenario).toBe("breakup");
  });

  it("drafts the last step as a breakup message (queued to Approvals)", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "Breakup Tester", points: [{ channel: "email", value: "breakup.test@example.com" }] });
    const opp = await provider.createOpportunity({ title: "Dormant deal", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });

    const r = await enroll("recall", `deal:${opp.id}`);
    expect(r.enrolled).toBe(1);

    // Drive far enough ahead that every step is due; one step advances per tick.
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    for (let i = 0; i < 4; i++) await runDueSteps(future);

    const queued = await listOutbox("pending");
    const mine = queued.filter((o) => o.dealId === opp.id && o.channel === "email");
    // The final email touch is a breakup; the earlier email open is not.
    const breakup = mine.find((o) => BREAKUP.test(o.body));
    expect(breakup, "expected a breakup-style final email").toBeTruthy();
  });
});
