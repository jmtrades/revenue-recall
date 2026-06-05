import { describe, it, expect, vi } from "vitest";

// Force the AI path, then have the model return a schema-valid but EMPTY body to
// prove the pipeline falls back to a real template instead of emitting "".
vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => true,
  completeJson: vi.fn(async () => ({ subject: "S", body: "   " })),
}));
vi.mock("@/lib/ai/refine", () => ({
  refineForHumanness: vi.fn(async (o: { draft: { subject?: string; body: string } }) => o.draft),
}));
vi.mock("@/lib/billing/enforce", () => ({ isEntitled: async () => true }));

import { draftReply } from "@/lib/ai/reply";
import { draftMessage } from "@/lib/ai/draft";

describe("an empty model body never reaches a send", () => {
  it("draftReply falls back to a non-empty template", async () => {
    const r = await draftReply({ channel: "email", contactName: "Bob", dealTitle: "Renewal", incoming: "how much?" });
    expect(r.body.trim().length).toBeGreaterThan(0);
    expect(r.source).toBe("template");
  });

  it("draftMessage falls back to a non-empty template", async () => {
    const r = await draftMessage({
      channel: "email",
      contactName: "Bob",
      dealTitle: "Renewal",
      valueLabel: "Value",
      value: 1000,
      currency: "USD",
      stageLabel: "open",
      industryLabel: "SaaS",
    });
    expect(r.body.trim().length).toBeGreaterThan(0);
    expect(r.source).toBe("template");
  });
});
