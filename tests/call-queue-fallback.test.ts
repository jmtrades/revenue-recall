import { describe, it, expect } from "vitest";
import { callableOpenLeads } from "@/lib/queries";
import { MAX_CALL_ATTEMPTS } from "@/lib/calls/retry";
import type { Activity, Contact, Opportunity, Stage } from "@/lib/crm/types";

// A freshly-onboarded org has leads but nothing has gone cold yet, so the
// recall-scored queue is empty. The Power Dialer must still have people to call
// (otherwise "where do I start calling?" is a dead end) — it falls back to
// callable OPEN leads. This pins that fallback's selection + guards.

const STAGES: Stage[] = [
  { id: "open1", label: "New", type: "open" },
  { id: "won1", label: "Won", type: "won" },
];
const stagesByPipeline = new Map<string, Stage[]>([["p1", STAGES]]);

function contact(id: string, phone?: string, attributes?: Record<string, unknown>): Contact {
  return { id, name: `Lead ${id}`, points: phone ? [{ channel: "phone", value: phone }] : [{ channel: "email", value: `${id}@x.com` }], attributes: attributes as never };
}
function opp(id: string, contactId: string, value: number, stageId = "open1"): Opportunity {
  return { id, title: `Deal ${id}`, pipelineId: "p1", stageId, value, currency: "USD", contactId } as Opportunity;
}
const ctx = (over: Partial<{ actsByContact: Map<string, Activity[]>; callAttempts: Map<string, number>; alreadyQueued: Set<string> }> = {}) => ({
  actsByContact: over.actsByContact ?? new Map<string, Activity[]>(),
  callAttempts: over.callAttempts ?? new Map<string, number>(),
  alreadyQueued: over.alreadyQueued,
});

describe("callableOpenLeads (dialer fresh-workspace fallback)", () => {
  it("surfaces open leads with a phone, highest value first, tagged new_lead", () => {
    const contacts = new Map([["c1", contact("c1", "+15550000001")], ["c2", contact("c2", "+15550000002")]]);
    const out = callableOpenLeads([opp("o1", "c1", 1000), opp("o2", "c2", 9000)], contacts, stagesByPipeline, ctx());
    expect(out.map((i) => i.contactId)).toEqual(["c2", "c1"]); // 9000 before 1000
    expect(out.every((i) => i.reason === "new_lead")).toBe(true);
  });

  it("skips leads with no phone, closed-stage deals, and opted-out contacts", () => {
    const contacts = new Map([
      ["np", contact("np")], // no phone
      ["closed", contact("closed", "+15550000003")],
      ["opt", contact("opt", "+15550000004", { doNotContact: true })],
      ["ok", contact("ok", "+15550000005")],
    ]);
    const out = callableOpenLeads(
      [opp("o_np", "np", 100), opp("o_closed", "closed", 100, "won1"), opp("o_opt", "opt", 100), opp("o_ok", "ok", 100)],
      contacts, stagesByPipeline, ctx(),
    );
    expect(out.map((i) => i.contactId)).toEqual(["ok"]);
  });

  it("drops a contact already dialed the max times, and de-dupes one card per person", () => {
    const contacts = new Map([["c1", contact("c1", "+15550000006")], ["c2", contact("c2", "+15550000007")]]);
    const callAttempts = new Map([["c1", MAX_CALL_ATTEMPTS]]);
    const out = callableOpenLeads([opp("o1a", "c1", 500), opp("o2a", "c2", 400), opp("o2b", "c2", 300)], contacts, stagesByPipeline, ctx({ callAttempts }));
    expect(out.map((i) => i.contactId)).toEqual(["c2"]); // c1 capped; c2 once
  });

  it("respects an alreadyQueued exclusion set", () => {
    const contacts = new Map([["c1", contact("c1", "+15550000008")]]);
    const out = callableOpenLeads([opp("o1", "c1", 100)], contacts, stagesByPipeline, ctx({ alreadyQueued: new Set(["c1"]) }));
    expect(out).toHaveLength(0);
  });
});
