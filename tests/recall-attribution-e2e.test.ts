import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { getRecallOutcomes, safePipeline } from "@/lib/queries";
import { recordRecallTouch, __resetRecallEventsForTests } from "@/lib/recall/events";
import { __resetEnrollmentsForTests } from "@/lib/cadence";
import type { Stage } from "@/lib/crm/types";

// End-to-end over the REAL recovered-revenue path the dashboard uses:
//   recordRecallTouch → listRecallTouches → earliestTouchByDeal → computeRecallOutcomes
// (all wired inside getRecallOutcomes). Locks in that a recall touch actually
// flows through to the headline "recovered revenue" metric, and that attribution
// only credits a win that landed on/after the touch.
beforeEach(() => {
  __resetEnrollmentsForTests();
  __resetRecallEventsForTests();
});

async function stagesOf() {
  const pipeline = safePipeline(await getProvider().listPipelines());
  const open = pipeline.stages.find((s: Stage) => s.type === "open") ?? pipeline.stages[0];
  const won = pipeline.stages.find((s: Stage) => s.type === "won");
  if (!won) throw new Error("seed pipeline has no won stage");
  return { pipelineId: pipeline.id, open, won };
}

describe("recovered-revenue attribution (end to end)", () => {
  it("credits a recall-touched deal that later wins", async () => {
    const provider = getProvider();
    const { pipelineId, open, won } = await stagesOf();
    const baseline = await getRecallOutcomes();

    const contact = await provider.createContact({ name: "E2E Recall", points: [{ channel: "email", value: `e2e${Date.now()}@x.com` }] });
    const deal = await provider.createOpportunity({ title: "Recoverable", pipelineId, stageId: open.id, value: 9000, currency: "USD", contactId: contact.id, source: "test" });

    // A recall message went out yesterday …
    await recordRecallTouch({ dealId: deal.id, contactId: contact.id, channel: "email", source: "manual", occurredAt: new Date(Date.now() - 86_400_000).toISOString() });
    // … then the deal comes back and is won today (closedAt = now, after the touch).
    await provider.moveOpportunity(deal.id, won.id);

    const after = await getRecallOutcomes();
    expect(after.recalled).toBe(baseline.recalled + 1);
    expect(after.wonBack).toBe(baseline.wonBack + 1);
    expect(after.recoveredValue).toBe(baseline.recoveredValue + 9000);
  });

  it("does NOT credit a deal that was already won before its first recall touch", async () => {
    const provider = getProvider();
    const { pipelineId, open, won } = await stagesOf();

    const contact = await provider.createContact({ name: "Won First", points: [{ channel: "email", value: `wf${Date.now()}@x.com` }] });
    const deal = await provider.createOpportunity({ title: "Won before touch", pipelineId, stageId: open.id, value: 4000, currency: "USD", contactId: contact.id, source: "test" });

    await provider.moveOpportunity(deal.id, won.id); // won NOW
    const mid = await getRecallOutcomes();

    // A touch recorded AFTER the win must not retroactively claim it.
    await recordRecallTouch({ dealId: deal.id, contactId: contact.id, channel: "email", source: "manual", occurredAt: new Date(Date.now() + 60_000).toISOString() });

    const after = await getRecallOutcomes();
    expect(after.wonBack).toBe(mid.wonBack); // no false win-back
    expect(after.recoveredValue).toBe(mid.recoveredValue); // no phantom revenue
  });
});
