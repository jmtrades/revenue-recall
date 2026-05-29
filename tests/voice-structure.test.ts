import { describe, it, expect } from "vitest";
import { draftMessage, type DraftInput } from "@/lib/ai/draft";

// A clean banned-phrase check isn't enough: copy can avoid every "AI tell" and
// still read like a mail-merge if every message has the same shape. These tests
// assert the deterministic fallback varies its *structure* across deals — the
// greeting, the skeleton, the closer — not just the words it slots in.

function gen(i: number, channel: DraftInput["channel"], cold: boolean) {
  return draftMessage({
    channel,
    // Fixed contact, varying deal — so greeting variety comes from the skeleton
    // pools, not from a different name being interpolated each time.
    contactName: "Jordan Avery",
    company: "Northside Co",
    dealTitle: `Deal ${i}`,
    valueLabel: "Value",
    value: 40000,
    currency: "USD",
    stageLabel: "Proposal",
    industryLabel: "real_estate",
    industryId: "real_estate",
    daysSinceContact: cold ? 30 : 2,
    recallReason: cold ? "lost_winnable" : undefined,
  });
}

/** Strip per-deal specifics so two messages with the same shape collapse together. */
function shape(body: string): string {
  return body.replace(/Deal \d+/g, "·").replace(/\d+/g, "#");
}

const N = 40;

describe("fallback copy is structurally varied, not a fixed template", () => {
  for (const channel of ["email", "sms"] as const) {
    for (const cold of [true, false]) {
      it(`${channel} / ${cold ? "cold" : "warm"}: many distinct shapes, none dominant`, async () => {
        const bodies: string[] = [];
        for (let i = 0; i < N; i++) bodies.push((await gen(i, channel, cold)).body);

        const distinctBodies = new Set(bodies).size;
        const distinctShapes = new Set(bodies.map(shape)).size;

        // Lots of distinct bodies, and several genuinely different structures.
        expect(distinctBodies).toBeGreaterThanOrEqual(15);
        expect(distinctShapes).toBeGreaterThanOrEqual(6);

        // No single message should account for more than a quarter of the batch.
        const counts = new Map<string, number>();
        for (const b of bodies) counts.set(b, (counts.get(b) ?? 0) + 1);
        expect(Math.max(...counts.values())).toBeLessThanOrEqual(N / 4);
      });
    }
  }

  it("email greetings rotate across deals", async () => {
    const greetings = new Set<string>();
    for (let i = 0; i < N; i++) greetings.add((await gen(i, "email", false)).body.split("\n")[0]);
    expect(greetings.size).toBeGreaterThanOrEqual(3);
  });
});
