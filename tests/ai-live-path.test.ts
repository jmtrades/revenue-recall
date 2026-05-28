import { vi, describe, it, expect, beforeEach } from "vitest";

// The live-AI branch (with an API key) was previously never exercised by tests —
// every other suite runs the no-key fallback. Here we mock the Anthropic client
// so we can verify: (1) the AI branch is taken and its output is returned, and
// (2) a malformed/failed completion falls back to the human template instead of
// throwing. This guards the marquee feature, not just the demo path.

vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => true,
  aiModel: () => "test-model",
  completeJson: vi.fn(),
}));

import { completeJson } from "@/lib/ai/client";
import { draftMessage } from "@/lib/ai/draft";
import { draftReply } from "@/lib/ai/reply";

const mockComplete = completeJson as unknown as ReturnType<typeof vi.fn>;

const baseDraft = {
  contactName: "Jordan Lee",
  company: "Acme",
  dealTitle: "Acme — Deal",
  valueLabel: "ARR",
  value: 12000,
  currency: "USD",
  stageLabel: "Proposal",
  industryLabel: "SaaS",
  industryId: "saas",
} as const;

beforeEach(() => {
  mockComplete.mockReset();
});

describe("draftMessage live AI path", () => {
  it("returns the AI completion and marks it as ai", async () => {
    mockComplete.mockResolvedValue({ subject: "quick thought", body: "hey — saw your trial wrapped, worth 15 min?" });
    const out = await draftMessage({ ...baseDraft, channel: "email", daysSinceContact: 3 });
    expect(out.source).toBe("ai");
    expect(out.subject).toBe("quick thought");
    expect(out.body).toContain("trial");
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it("drops the subject for non-email channels even if the model returns one", async () => {
    mockComplete.mockResolvedValue({ subject: "ignored", body: "hey, free for a quick call this week?" });
    const out = await draftMessage({ ...baseDraft, channel: "sms", daysSinceContact: 3 });
    expect(out.source).toBe("ai");
    expect(out.subject).toBeUndefined();
  });

  it("falls back to the human template when the model call fails", async () => {
    mockComplete.mockRejectedValue(new Error("500 from provider"));
    const out = await draftMessage({ ...baseDraft, channel: "email", daysSinceContact: 30, recallReason: "lost_winnable" });
    expect(out.source).toBe("template");
    expect(out.body).toContain("Jordan");
    expect(out.subject).toBeTruthy();
  });
});

describe("draftReply live AI path", () => {
  it("returns the AI reply and marks it as ai", async () => {
    mockComplete.mockResolvedValue({ subject: "Re: Acme", body: "totally fair — happy to send pricing over today." });
    const out = await draftReply({
      channel: "email",
      contactName: "Jordan Lee",
      dealTitle: "Acme — Deal",
      industryId: "saas",
      incoming: "How much does this cost?",
    });
    expect(out.source).toBe("ai");
    expect(out.body).toContain("pricing");
  });

  it("falls back to the human template when the model call fails", async () => {
    mockComplete.mockRejectedValue(new Error("timeout"));
    const out = await draftReply({
      channel: "sms",
      contactName: "Pat Diaz",
      dealTitle: "Deal",
      industryId: "generic",
      incoming: "not interested, went with someone else",
    });
    expect(out.source).toBe("template");
    expect(out.body.length).toBeGreaterThan(0);
  });
});
