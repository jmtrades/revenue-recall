import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import { hasCallConsent } from "@/lib/agent/guardrails";
import type { AgentTask } from "@/lib/agent/types";
import type { Contact } from "@/lib/crm/types";

// AI/artificial voice needs prior express consent (FCC 2024). The autonomous
// agent must never auto-dial a contact without a recorded consent marker.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
});
afterEach(() => vi.useRealTimers());

const MIDDAY_ET = new Date("2026-06-12T18:00:00Z"); // 2pm ET — inside the courtesy window

function autoCall(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel: "call", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

async function callDeal(attributes: Record<string, unknown>) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  const contact = await provider.createContact({ name: "Consent Test", points: [{ channel: "phone", value: "+12125550188" }], attributes: attributes as never });
  return provider.createOpportunity({ title: "Reconnect about the listing", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
}

describe("hasCallConsent", () => {
  const c = (attributes: Record<string, unknown>): Contact => ({ id: "c", name: "x", points: [], attributes: attributes as never });
  it("recognizes consent markers and rejects their absence", () => {
    expect(hasCallConsent(c({ callConsent: true }))).toBe(true);
    expect(hasCallConsent(c({ voiceConsent: "yes" }))).toBe(true);
    expect(hasCallConsent(c({ consentToCall: 1 }))).toBe(true);
    expect(hasCallConsent(c({ callConsentAt: "2026-01-01T00:00:00Z" }))).toBe(true);
    expect(hasCallConsent(c({}))).toBe(false);
    expect(hasCallConsent(c({ callConsent: false }))).toBe(false);
    expect(hasCallConsent(undefined)).toBe(false);
  });
});

describe("autopilot consent-gates AI voice calls", () => {
  it("does NOT auto-dial a contact without recorded consent (hands to the dialer)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY_ET);
    const opp = await callDeal({});
    const run = await runTask(autoCall(opp.id));
    expect(run.actions[0].result).toBe("queued");
  });

  it("auto-dials when consent is on file", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY_ET);
    const opp = await callDeal({ callConsent: true });
    const run = await runTask(autoCall(opp.id));
    expect(["sent", "logged"]).toContain(run.actions[0].result);
  });
});
