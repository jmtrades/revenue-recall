import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what the cadence asks the drafter for, so we can prove it passes the
// deal's ACTUAL recall reason (not a hardcoded one) into the draft.
const { draftMessage } = vi.hoisted(() => ({
  draftMessage: vi.fn(async () => ({ subject: "s", body: "b", source: "template" as const })),
}));
vi.mock("@/lib/ai/draft", () => ({ draftMessage }));

import { enroll, runDueSteps, __resetEnrollmentsForTests } from "@/lib/cadence";
import { getProvider } from "@/lib/crm/registry";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SEQUENCE_AUTOPILOT;
  __resetEnrollmentsForTests();
  draftMessage.mockClear();
});

describe("recall cadence drafts with the deal's actual reason", () => {
  it("tags a ghosted-after-meeting deal as no_show, not a generic recall", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "No Show Nancy", points: [{ channel: "email", value: "noshow@example.com" }] });
    const opp = await provider.createOpportunity({ title: "Booked-then-quiet deal", pipelineId: pipeline.id, stageId: stage.id, value: 8000, currency: "USD", contactId: contact.id });

    // Last touch was a booked meeting that then went quiet → the recall engine
    // should classify this as a no_show.
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    await provider.logActivity({ opportunityId: opp.id, contactId: contact.id, kind: "meeting", summary: "Discovery call booked", occurredAt: fiveDaysAgo });

    await enroll("recall", `deal:${opp.id}`);
    // First step is an email (day 0) → drafts immediately.
    await runDueSteps();

    expect(draftMessage).toHaveBeenCalled();
    const input = draftMessage.mock.calls[0][0] as { recallReason?: string };
    expect(input.recallReason).toBe("no_show");
  });
});
