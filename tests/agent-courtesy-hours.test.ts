import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import type { AgentTask } from "@/lib/agent/types";

// No AI key → template drafting; logged transports. The engine reads the wall
// clock for the courtesy check, so the clock is pinned with fake timers.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  process.env.SMS_A2P_REGISTERED = "true"; // platform A2P attested; this suite isolates courtesy hours
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.SMS_A2P_REGISTERED;
});

const DAWN_WEST = new Date("2026-06-12T12:00:00Z"); // 5am San Francisco · 8am New York

function autoTask(channel: AgentTask["channel"], dealId: string): AgentTask {
  return { id: `t_${dealId}_${channel}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel, autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

async function dealWithPhone(phone: string) {
  const provider = getProvider();
  const pipeline = (await provider.listPipelines())[0];
  const stage = pipeline.stages.find((s) => s.type === "open")!;
  // SMS consent on file so this test isolates COURTESY HOURS, not the consent gate.
  const contact = await provider.createContact({ name: `Prospect ${phone.slice(-4)}`, points: [{ channel: "phone", value: phone }], attributes: { smsConsent: true } as never });
  return provider.createOpportunity({ title: `Deal ${phone.slice(-4)}`, pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id });
}

describe("autopilot honors the PROSPECT's courtesy hours on phone channels", () => {
  it("holds an auto-SMS at dawn their time, then sends once their window opens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(DAWN_WEST);
    const opp = await dealWithPhone("+14155550142"); // San Francisco

    const held = await runTask(autoTask("sms", opp.id));
    expect(held.actions[0].result).toBe("skipped");
    expect(held.actions[0].detail).toContain("outside sending hours");

    // A held touch logs nothing, so there's no cooldown — the next run sends.
    vi.setSystemTime(new Date("2026-06-12T16:00:00Z")); // 9am San Francisco
    const sent = await runTask(autoTask("sms", opp.id));
    expect(["sent", "logged"]).toContain(sent.actions[0].result);
  });

  it("holds an auto-dial the same way", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(DAWN_WEST);
    const opp = await dealWithPhone("+13105550107"); // Los Angeles
    const run = await runTask(autoTask("call", opp.id));
    expect(run.actions[0].result).toBe("skipped");
    expect(run.actions[0].detail).toContain("outside sending hours");
  });

  it("does not hold a prospect whose own clock is fine at the same instant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(DAWN_WEST);
    const opp = await dealWithPhone("+12125550163"); // New York — 8:00am, window just opened
    const run = await runTask(autoTask("sms", opp.id));
    expect(["sent", "logged"]).toContain(run.actions[0].result);
  });
});
