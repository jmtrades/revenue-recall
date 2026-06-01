import { describe, it, expect, beforeEach } from "vitest";
import { callSummaryText, logCallOutcome } from "@/lib/calls";
import { recordingDisclosure } from "@/lib/agent/guardrails";
import { getProvider } from "@/lib/crm/registry";

beforeEach(() => {
  delete process.env.CALL_RECORDING_DISCLOSURE;
});

describe("recordingDisclosure", () => {
  it("is null when unset and the trimmed text when configured", () => {
    expect(recordingDisclosure()).toBeNull();
    process.env.CALL_RECORDING_DISCLOSURE = "  Just so you know, this call may be recorded.  ";
    expect(recordingDisclosure()).toBe("Just so you know, this call may be recorded.");
  });
});

describe("callSummaryText", () => {
  it("builds a readable timeline summary with outcome, duration, transcript and recording", () => {
    const s = callSummaryText({ outcome: "booked", durationSec: 92.4, transcript: "Rep: Hi\nProspect: Hey", recordingUrl: "https://x/y.wav" });
    expect(s).toContain("Call — booked (92s)");
    expect(s).toContain("Rep: Hi");
    expect(s).toContain("Recording: https://x/y.wav");
  });
  it("degrades gracefully with no detail", () => {
    expect(callSummaryText({})).toBe("Call");
  });
});

describe("logCallOutcome", () => {
  it("writes an outbound call activity onto the deal timeline", async () => {
    const provider = getProvider();
    const pipeline = (await provider.listPipelines())[0];
    const stage = pipeline.stages.find((s) => s.type === "open")!;
    const contact = await provider.createContact({ name: "Call Logged", points: [{ channel: "phone", value: "+15551230000" }] });
    const opp = await provider.createOpportunity({ title: "Logged deal", pipelineId: pipeline.id, stageId: stage.id, value: 1000, currency: "USD", contactId: contact.id });

    const activity = await logCallOutcome({ dealId: opp.id, contactId: contact.id, outcome: "completed", transcript: "Rep: Hi there", durationSec: 40 });
    expect(activity).not.toBeNull();
    expect(activity!.kind).toBe("call");
    expect(activity!.direction).toBe("outbound");

    const onTimeline = await provider.listActivities(opp.id);
    expect(onTimeline.some((a) => a.kind === "call" && a.summary.includes("completed"))).toBe(true);
  });

  it("returns null when there's nothing to attach to", async () => {
    expect(await logCallOutcome({ outcome: "no-answer" })).toBeNull();
  });
});
