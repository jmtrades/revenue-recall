import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import { hasSmsConsent } from "@/lib/agent/guardrails";
import type { AgentTask } from "@/lib/agent/types";
import type { Contact } from "@/lib/crm/types";

// Marketing SMS needs prior express consent (TCPA). The autonomous agent must
// never auto-text a contact without a recorded consent marker — those are held
// for human review/approval, mirroring the call-consent gate.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
});
afterEach(() => vi.useRealTimers());

const MIDDAY_ET = new Date("2026-06-12T18:00:00Z"); // 2pm ET — inside the courtesy window

function autoSms(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel: "sms", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

async function smsDeal(attributes: Record<string, unknown>) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "SMS Consent Test", points: [{ channel: "phone", value: "+12125550143" }], attributes: attributes as never });
  return provider.createOpportunity({ title: "Reconnect about the listing", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
}

describe("hasSmsConsent", () => {
  const c = (attributes: Record<string, unknown>): Contact => ({ id: "c", name: "x", points: [], attributes: attributes as never });
  it("recognizes consent markers and rejects their absence", () => {
    expect(hasSmsConsent(c({ smsConsent: true }))).toBe(true);
    expect(hasSmsConsent(c({ textConsent: "yes" }))).toBe(true);
    expect(hasSmsConsent(c({ consentToText: 1 }))).toBe(true);
    expect(hasSmsConsent(c({ consentToContact: true }))).toBe(true);
    expect(hasSmsConsent(c({ smsConsentAt: "2026-01-01T00:00:00Z" }))).toBe(true);
    expect(hasSmsConsent(c({}))).toBe(false);
    expect(hasSmsConsent(c({ smsConsent: false }))).toBe(false);
    expect(hasSmsConsent(undefined)).toBe(false);
  });
});

describe("autopilot consent-gates marketing SMS", () => {
  it("does NOT auto-text a contact without recorded consent (holds for review)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY_ET);
    const opp = await smsDeal({});
    const run = await runTask(autoSms(opp.id));
    expect(run.actions[0].result).toBe("drafted");
  });

  it("auto-texts when consent is on file", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY_ET);
    const opp = await smsDeal({ smsConsent: true });
    const run = await runTask(autoSms(opp.id));
    expect(["sent", "logged"]).toContain(run.actions[0].result);
  });
});
