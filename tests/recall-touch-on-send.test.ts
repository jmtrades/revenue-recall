import { describe, it, expect, beforeEach } from "vitest";
import { enroll, runDueSteps, __resetEnrollmentsForTests } from "@/lib/cadence";
import { listOutbox } from "@/lib/agent/store";
import { listRecallTouches, __resetRecallEventsForTests } from "@/lib/recall/events";
import { POST as decideOutbox } from "@/app/api/agent/outbox/[id]/route";

// No AI key + no Supabase + no autopilot → template drafting, in-memory store, and
// review mode (recall drafts queue to Approvals instead of auto-sending). This is
// exactly the recommended launch posture, where the over-attribution bug bit:
// a queued-but-never-sent recall draft used to log a "touch".
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SEQUENCE_AUTOPILOT;
  __resetEnrollmentsForTests();
  __resetRecallEventsForTests();
});

function decide(id: string, action: "approve" | "dismiss") {
  return decideOutbox(
    new Request(`http://x/api/agent/outbox/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
    { params: { id } },
  );
}

/** Queue the recall sequence's day-0 email step and return the drafts THIS run queued.
 *  (The in-memory outbox isn't reset between tests, so we diff against what existed.) */
async function queueRecallDrafts() {
  const beforeIds = new Set((await listOutbox("pending")).map((o) => o.id));
  const r = await enroll("recall", "recall_queue");
  expect(r.enrolled).toBeGreaterThan(0);
  const tick = await runDueSteps();
  expect(tick.queued).toBeGreaterThan(0); // review mode → Approvals, not auto-sent
  expect(tick.sent).toBe(0);
  return (await listOutbox("pending")).filter((o) => !beforeIds.has(o.id));
}

describe("recall attribution follows the actual send, not the queue", () => {
  it("queuing a recall draft records NO touch and tags it for later attribution", async () => {
    const mine = await queueRecallDrafts();
    expect(mine.length).toBeGreaterThan(0);
    // Tagged so the eventual send can be attributed …
    expect(mine.every((o) => o.recall === true)).toBe(true);
    // … but nothing has actually gone out, so recovered-revenue stays empty.
    expect((await listRecallTouches()).length).toBe(0);
  });

  it("approving a queued recall draft records exactly one touch (the real send)", async () => {
    const mine = await queueRecallDrafts();
    const res = await decide(mine[0].id, "approve");
    expect(res.status).toBe(200); // email "logs" (simulated send) without a provider

    const touches = await listRecallTouches();
    expect(touches.length).toBe(1);
    expect(touches[0].source).toBe("manual"); // a human approved the send
    expect(touches[0].channel).toBe("email");
    expect(touches[0].dealId).toBe(mine[0].dealId);
  });

  it("dismissing a queued recall draft records no touch (it never sent)", async () => {
    const mine = await queueRecallDrafts();
    const res = await decide(mine[0].id, "dismiss");
    expect(res.status).toBe(200);
    expect((await listRecallTouches()).length).toBe(0);
  });
});
