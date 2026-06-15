import { vi, describe, it, expect, beforeEach } from "vitest";

// Margin guard #1b: cold, low-stakes re-engagement nudges draft on the cheap
// model and skip the refine pass; live replies and warm drafts keep the premium
// model + refine.
vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => true,
  aiModel: () => "premium-model",
  aiCheapModel: () => "cheap-model",
  completeJson: vi.fn(),
}));
vi.mock("@/lib/ai/refine", () => ({ refineForHumanness: vi.fn(async (o: { draft: unknown }) => o.draft) }));

import { completeJson } from "@/lib/ai/client";
import { refineForHumanness } from "@/lib/ai/refine";
import { draftMessage } from "@/lib/ai/draft";

const mockComplete = completeJson as unknown as ReturnType<typeof vi.fn>;
const mockRefine = refineForHumanness as unknown as ReturnType<typeof vi.fn>;

const base = { contactName: "Jordan", dealTitle: "Deal", valueLabel: "ARR", value: 12000, currency: "USD", stageLabel: "Proposal", industryLabel: "SaaS", industryId: "saas" } as const;

beforeEach(() => {
  mockComplete.mockReset();
  mockRefine.mockClear();
  mockComplete.mockResolvedValue({ subject: "x", body: "Hey Jordan, still worth a look?" });
});

describe("cold-nudge cheap-model routing (#1b)", () => {
  it("uses the cheap model and skips refine on a long-dormant cold nudge", async () => {
    await draftMessage({ ...base, channel: "email", daysSinceContact: 60, recallReason: "going_cold" });
    expect(mockComplete.mock.calls[0][0].model).toBe("cheap-model");
    expect(mockRefine).not.toHaveBeenCalled();
  });

  it("uses the premium model + refine for a live reply (lastInbound present)", async () => {
    await draftMessage({ ...base, channel: "email", daysSinceContact: 60, recallReason: "going_cold", lastInbound: "Is this still available?" });
    expect(mockComplete.mock.calls[0][0].model).toBeUndefined();
    expect(mockRefine).toHaveBeenCalledOnce();
  });

  it("uses the premium model + refine for a warm, recent draft", async () => {
    await draftMessage({ ...base, channel: "email", daysSinceContact: 2 });
    expect(mockComplete.mock.calls[0][0].model).toBeUndefined();
    expect(mockRefine).toHaveBeenCalledOnce();
  });
});
