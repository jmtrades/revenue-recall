import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enroll, runDueSteps } from "@/lib/cadence";
import { listOutbox } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";

// No AI key → template drafting; in-memory store. SEQUENCE_AUTOPILOT turns on
// cadence auto-send so the courtesy hold is actually exercised.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.SEQUENCE_AUTOPILOT = "true";
  // Isolate the courtesy-window logic from the (separately tested) TCPA gate:
  // attest A2P here and put consent on each contact, so the ONLY thing that can
  // hold a text is the prospect's local hour.
  process.env.SMS_A2P_REGISTERED = "true";
});
afterEach(() => {
  delete process.env.SMS_A2P_REGISTERED;
});

// Tomorrow at 13:00 UTC — due for a day-0 step enrolled now, and season-proof:
// 5am (PDT) / 6am (PST) in San Francisco → outside the courtesy window, while
// New York sits at 9am (EDT) / 8am (EST) → inside it either way.
const DAWN_WEST = `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T13:00:00Z`;

async function enrollDealWithPhone(phone: string, title: string) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: title, points: [{ channel: "phone", value: phone }], attributes: { smsConsent: true } as never });
  const opp = await provider.createOpportunity({ title, pipelineId: pipeline.id, stageId: stage.id, value: 3000, currency: "USD", contactId: contact.id });
  // new_lead: step 0 is a day-0 call (drops a task), step 1 is a day-0 SMS —
  // so the SECOND tick exercises the autonomous SMS path.
  const r = await enroll("new_lead", `deal:${opp.id}`);
  expect(r.enrolled).toBe(1);
  return contact;
}

describe("cadence auto-SMS honors the prospect's courtesy hours", () => {
  it("queues a dawn-their-time SMS to Approvals while a same-instant East Coast SMS auto-sends", async () => {
    const west = await enrollDealWithPhone("+14155550188", "West Coast Lead");
    await enrollDealWithPhone("+12125550188", "East Coast Lead");

    // Tick 1: both call steps (queued as tasks), enrollments advance to the SMS step.
    const first = await runDueSteps(DAWN_WEST);
    expect(first.processed).toBe(2);

    // Tick 2: 5am for the 415 number → held to Approvals; 8am for the 212 → sends.
    const second = await runDueSteps(DAWN_WEST);
    expect(second.processed).toBe(2);
    expect(second.sent).toBe(1); // the New York text went out
    expect(second.queued).toBe(1); // the San Francisco text waits for a human (or their morning)

    const pending = await listOutbox("pending");
    expect(pending.some((o) => o.channel === "sms" && o.contactId === west.id)).toBe(true);
  });
});
