import { vi, describe, it, expect, beforeEach } from "vitest";

// Verify the human-ness self-revision loop on the live-AI path: when the model's
// first draft trips an AI tell, we re-prompt it once with the flags and ship the
// cleaned version; when the first draft is already clean, we don't spend a second
// call. Both draftMessage and draftReply share the refine step.

vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => true,
  aiModel: () => "test-model",
  completeJson: vi.fn(),
}));

import { completeJson } from "@/lib/ai/client";
import { draftMessage } from "@/lib/ai/draft";
import { analyzeHumanness } from "@/lib/humanness";

const mock = completeJson as unknown as ReturnType<typeof vi.fn>;

const base = {
  channel: "email" as const,
  contactName: "Jordan Lee",
  company: "Acme",
  dealTitle: "Acme — Deal",
  valueLabel: "ARR",
  value: 12000,
  currency: "USD",
  stageLabel: "Proposal",
  industryLabel: "SaaS",
  industryId: "saas",
  daysSinceContact: 5,
};

beforeEach(() => mock.mockReset());

describe("human-ness self-revision", () => {
  it("rewrites a tell-laden first draft exactly once and ships the clean version", async () => {
    mock
      .mockResolvedValueOnce({ subject: "circling back", body: "I wanted to reach out to circle back and touch base at your earliest convenience." })
      .mockResolvedValueOnce({ subject: "quick one", body: "hey jordan, saw the proposal's been sitting — still worth a look, or should i park it?" });

    const out = await draftMessage(base);

    expect(mock).toHaveBeenCalledTimes(2); // initial draft + one revision
    expect(out.source).toBe("ai");
    expect(analyzeHumanness(out.body).rating).not.toBe("robotic");
    expect(out.body.toLowerCase()).not.toContain("circling back");
  });

  it("does not spend a revision call when the first draft is already human", async () => {
    mock.mockResolvedValue({ subject: "quick one", body: "hey jordan, saw the proposal's been sitting — still live, or should i close it out?" });

    const out = await draftMessage(base);

    expect(mock).toHaveBeenCalledOnce();
    expect(out.source).toBe("ai");
  });

  it("keeps the first draft if the revision somehow scores worse", async () => {
    mock
      .mockResolvedValueOnce({ subject: "s", body: "I just wanted to share a quick update on where things stand for you." })
      .mockResolvedValueOnce({ subject: "s", body: "I hope this email finds you well. I wanted to reach out to circle back and touch base." });

    const out = await draftMessage(base);
    expect(mock).toHaveBeenCalledTimes(2);
    // The worse revision is rejected; we keep the (less-bad) original.
    expect(out.body).toContain("I just wanted to share");
  });
});
