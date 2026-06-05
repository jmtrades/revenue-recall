import { describe, it, expect } from "vitest";
import { getCallQueue } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { MAX_CALL_ATTEMPTS } from "@/lib/calls/retry";

describe("dialer call queue: attempt tracking", () => {
  it("exposes a non-negative numeric attempt count on every queued call", async () => {
    const q = await getCallQueue();
    expect(q.every((i) => typeof i.attempts === "number" && i.attempts >= 0)).toBe(true);
  });

  it("drops a number once it's been dialed the max times (no wasted dials)", async () => {
    const q0 = await getCallQueue();
    if (q0.length === 0) return; // no seeded recall queue in this env — nothing to assert
    const target = q0[0];
    // Log MAX outbound calls to the contact. contactId-only (no opportunityId) so
    // the deal isn't freshened — it would otherwise still be recall-flagged, so a
    // drop here proves the attempt cap, not a recency change.
    for (let i = 0; i < MAX_CALL_ATTEMPTS; i++) {
      await getProvider().logActivity({ contactId: target.contactId, kind: "call", direction: "outbound", summary: "no answer", occurredAt: new Date().toISOString() });
    }
    const q1 = await getCallQueue();
    expect(q1.find((i) => i.contactId === target.contactId)).toBeUndefined();
  });
});
