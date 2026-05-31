import { describe, it, expect } from "vitest";
import { buildDraftUserPrompt, type DraftInput } from "@/lib/ai/draft";

// The persisted "what your business does" profile is what lets the product
// tailor to ANY business — especially ones outside the built-in verticals
// (industry "generic"). These lock in that it actually reaches the model.
const base: DraftInput = {
  channel: "email",
  contactName: "Jordan Lee",
  dealTitle: "Spring wedding",
  valueLabel: "Value",
  value: 5000,
  currency: "USD",
  stageLabel: "Quoted",
  industryLabel: "Generic / Other",
  industryId: "generic",
};

describe("business profile grounds the AI draft", () => {
  it("injects the business description into the prompt when set", () => {
    const prompt = buildDraftUserPrompt({
      ...base,
      voice: { business: "Boutique wedding photography studio in Austin shooting destination weddings." },
    });
    expect(prompt).toContain("THE BUSINESS YOU WRITE FOR");
    expect(prompt).toContain("wedding photography studio in Austin");
  });

  it("omits the business block entirely when not set", () => {
    expect(buildDraftUserPrompt(base)).not.toContain("THE BUSINESS YOU WRITE FOR");
  });
});
