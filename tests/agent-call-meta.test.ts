import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { runTask } from "@/lib/agent/engine";
import { setVoiceTransport } from "@/lib/comms";
import { verifyCallMeta } from "@/lib/calls/meta-sig";
import type { AgentTask } from "@/lib/agent/types";

// The gateway echoes the per-call meta back to /api/calls/log so a finished
// call's transcript/outcome attaches to the right deal/contact/org. The manual
// dialer always signed it; the autopilot must too, or completed autonomous calls
// leave no trace. This drives runTask through a capturing voice transport.
const MIDDAY_ET = new Date("2026-06-12T18:00:00Z"); // inside the courtesy window

let captured: Record<string, string> | undefined;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BILLING_ENFORCE;
  captured = undefined;
  setVoiceTransport({
    id: "capture",
    available: () => true,
    place: async (c) => {
      captured = c.meta;
      return { id: "call_x", status: "queued", provider: "capture" }; // Twilio-style accept
    },
  });
});
afterEach(() => {
  setVoiceTransport(null);
  vi.useRealTimers();
});

function autoCall(dealId: string): AgentTask {
  return { id: `t_${dealId}`, name: "Auto", goal: "Re-engage.", trigger: "manual", scope: `deal:${dealId}`, channel: "call", autonomy: "auto", enabled: true, createdAt: new Date().toISOString() };
}

describe("autopilot call attaches signed meta for the gateway post-back", () => {
  it("passes signed contactId/dealId and records the queued call as sent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY_ET);
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({
      name: "Meta Test",
      points: [{ channel: "phone", value: "+12125550111" }],
      attributes: { callConsent: true } as never,
    });
    const opp = await provider.createOpportunity({
      title: "Meta deal", pipelineId: pipeline.id, stageId: stage.id, value: 5000, currency: "USD", contactId: contact.id,
    });

    const run = await runTask(autoCall(opp.id));

    expect(run.actions[0].result).toBe("sent"); // queued → sent (mapping fix), end-to-end
    expect(captured).toBeDefined();
    expect(captured!.contactId).toBe(contact.id);
    expect(captured!.dealId).toBe(opp.id);
    expect(verifyCallMeta(captured!)).toBe(true); // signed so the post-back can't be forged onto another tenant
  });
});
