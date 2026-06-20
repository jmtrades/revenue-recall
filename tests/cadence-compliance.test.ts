import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enroll, runDueSteps, __resetEnrollmentsForTests } from "@/lib/cadence";
import { listOutbox } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";

// The cadence autopilot must enforce the SAME send-compliance gates as the
// autonomous agent (engine.ts): TCPA per-contact SMS consent + A2P registration,
// and CAN-SPAM postal address + verified domain for email. Missing any → the step
// is HELD for human review (Approvals), never auto-sent. (Before this gate, an
// autopiloted SMS step cold-texted without consent and email blasted with no
// physical postal address.) No AI key → template drafting; in-memory store.
beforeEach(() => {
  __resetEnrollmentsForTests();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  delete process.env.COMPLIANCE_ADDRESS;
  delete process.env.EMAIL_DOMAIN_VERIFIED;
  delete process.env.SMS_A2P_REGISTERED;
  delete process.env.OUTBOUND_COMPLIANCE; // default = enabled
  process.env.SEQUENCE_AUTOPILOT = "true";
});
afterEach(() => {
  delete process.env.SEQUENCE_AUTOPILOT;
  delete process.env.COMPLIANCE_ADDRESS;
  delete process.env.EMAIL_DOMAIN_VERIFIED;
  delete process.env.SMS_A2P_REGISTERED;
});

// 2pm ET — comfortably inside the courtesy window for the 212 number, so a hold
// here can only be the compliance gate, never quiet hours.
const MIDDAY = `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T18:00:00Z`;

async function dealWithEmail() {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "Compliance Email", points: [{ channel: "email", value: "compliance@example.com" }] });
  return provider.createOpportunity({ title: "Reconnect", pipelineId: pipeline.id, stageId: stage.id, value: 4000, currency: "USD", contactId: contact.id });
}

async function dealWithPhone(consent: boolean) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({
    name: "Compliance SMS",
    points: [{ channel: "phone", value: "+12125550143" }],
    attributes: (consent ? { smsConsent: true } : {}) as never,
  });
  return { contact, opp: await provider.createOpportunity({ title: "Reconnect", pipelineId: pipeline.id, stageId: stage.id, value: 4000, currency: "USD", contactId: contact.id }) };
}

describe("cadence autopilot enforces CAN-SPAM email readiness", () => {
  it("HOLDS an autopiloted email when no postal address / verified domain is configured", async () => {
    const opp = await dealWithEmail();
    expect((await enroll("recall", `deal:${opp.id}`)).enrolled).toBe(1);
    const tick = await runDueSteps(MIDDAY); // recall step 0 is a day-0 email
    expect(tick.sent).toBe(0);
    expect(tick.queued).toBe(1);
    const pending = await listOutbox("pending");
    expect(pending.some((o) => o.dealId === opp.id && o.channel === "email")).toBe(true);
  });

  // The positive direction — email actually SENDS once a postal address + verified
  // domain are configured — is covered by cadence-daily-cap.test.ts (which sets
  // both and asserts a real send). Kept out of here to avoid coupling this gate
  // test to the recall template's exact claim-guard behavior.
});

describe("cadence autopilot enforces TCPA SMS consent + A2P", () => {
  it("HOLDS an autopiloted SMS to a contact with no recorded consent", async () => {
    process.env.SMS_A2P_REGISTERED = "true"; // isolate the per-contact consent gate
    const { opp } = await dealWithPhone(false);
    await enroll("new_lead", `deal:${opp.id}`); // step 0 call (task), step 1 SMS
    await runDueSteps(MIDDAY); // tick 1 → the call step, advances to the SMS step
    const tick = await runDueSteps(MIDDAY); // tick 2 → the SMS step
    expect(tick.sent).toBe(0);
    expect(tick.queued).toBe(1);
  });

  it("SENDS the SMS when consent is on file and A2P is registered", async () => {
    process.env.SMS_A2P_REGISTERED = "true";
    const { opp } = await dealWithPhone(true);
    await enroll("new_lead", `deal:${opp.id}`);
    await runDueSteps(MIDDAY);
    const tick = await runDueSteps(MIDDAY);
    expect(tick.sent).toBe(1);
    expect(tick.queued).toBe(0);
  });

  it("HOLDS even with consent when A2P 10DLC isn't registered", async () => {
    const { opp } = await dealWithPhone(true); // consent on file, but no A2P env
    await enroll("new_lead", `deal:${opp.id}`);
    await runDueSteps(MIDDAY);
    const tick = await runDueSteps(MIDDAY);
    expect(tick.sent).toBe(0);
    expect(tick.queued).toBe(1);
  });
});
