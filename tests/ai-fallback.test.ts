import { describe, it, expect, beforeEach } from "vitest";
import { draftMessage } from "@/lib/ai/draft";
import { summarizeCall } from "@/lib/ai/callSummary";

// Ensure no API key so the deterministic template path is exercised.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("draftMessage (template fallback)", () => {
  const base = {
    contactName: "Jordan Lee", company: "Acme", dealTitle: "Acme — Deal", valueLabel: "ARR",
    value: 12000, currency: "USD", stageLabel: "Proposal", industryLabel: "SaaS", repName: "Sam",
  } as const;

  it("returns a subject for email and no subject for sms", async () => {
    const email = await draftMessage({ ...base, channel: "email", daysSinceContact: 20, recallReason: "going_cold" });
    expect(email.source).toBe("template");
    expect(email.subject).toBeTruthy();
    expect(email.body).toContain("Jordan");

    const sms = await draftMessage({ ...base, channel: "sms", daysSinceContact: 2 });
    expect(sms.subject).toBeUndefined();
    expect(sms.body.length).toBeGreaterThan(0);
  });

  it("produces a call talk-track as bullet points", async () => {
    const call = await draftMessage({ ...base, channel: "call", daysSinceContact: 5 });
    expect(call.body).toContain("•");
  });
});

describe("summarizeCall (template fallback)", () => {
  it("classifies a voicemail and recommends a retry", async () => {
    const r = await summarizeCall({ contactName: "Pat", dealTitle: "Deal", notes: "Left a voicemail, no answer" });
    expect(r.outcome).toBe("voicemail");
    expect(r.source).toBe("template");
    expect(r.nextStep.toLowerCase()).toContain("again");
  });

  it("detects a booked meeting as a positive outcome", async () => {
    const r = await summarizeCall({ contactName: "Pat", dealTitle: "Deal", notes: "Great chat, booked a demo for Friday" });
    expect(r.outcome).toBe("meeting_booked");
    expect(r.sentiment).toBe("positive");
  });
});
