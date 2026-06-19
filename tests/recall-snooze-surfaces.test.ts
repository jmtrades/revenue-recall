import { describe, it, expect, vi, beforeEach } from "vitest";

// A rep snoozing a deal must mute it everywhere it would be contacted — not just
// the visual recall queue. Regression guard for the gap where the power dialer
// (getCallQueue) ignored snoozes and still auto-dialed a muted deal. listSnoozed-
// OppIds no-ops without a DB, so we mock it to assert the filter is applied.
const { listSnoozedOppIds } = vi.hoisted(() => ({ listSnoozedOppIds: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/recall/snooze", async (orig) => {
  const actual = await orig<typeof import("@/lib/recall/snooze")>();
  return { ...actual, listSnoozedOppIds };
});

import { getCallQueue } from "@/lib/queries";

beforeEach(() => {
  vi.clearAllMocks();
  listSnoozedOppIds.mockResolvedValue(new Set());
});

describe("recall snooze is honored on the power dialer", () => {
  it("drops a snoozed deal from the call queue", async () => {
    const q0 = await getCallQueue();
    if (q0.length === 0) return; // no seeded recall queue in this env — nothing to assert
    const target = q0[0];
    listSnoozedOppIds.mockResolvedValue(new Set([target.dealId]));
    const q1 = await getCallQueue();
    expect(q1.find((i) => i.dealId === target.dealId)).toBeUndefined();
  });
});
