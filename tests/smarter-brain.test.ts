import { describe, it, expect, beforeEach } from "vitest";
import { buildDraftUserPrompt, type DraftInput } from "@/lib/ai/draft";
import { batchEffort } from "@/lib/ai/batch";

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

describe("mood-aware drafting", () => {
  it("injects a read-the-room coaching note matched to the prospect's mood", () => {
    const frustrated = buildDraftUserPrompt({ ...base, lastInbound: "honestly this is a waste of my time" });
    expect(frustrated).toContain("How they sound right now");
    expect(frustrated.toLowerCase()).toContain("frustrated");

    const excited = buildDraftUserPrompt({ ...base, lastInbound: "I love this, let's do it!" });
    expect(excited).toContain("How they sound right now");
    expect(excited.toLowerCase()).toContain("energy");
  });

  it("omits the mood note when there's no inbound to read", () => {
    expect(buildDraftUserPrompt(base)).not.toContain("How they sound right now");
  });
});

describe("anti-repeat across touches", () => {
  it("tells the model not to repeat earlier angles when history exists", () => {
    const withHistory = buildDraftUserPrompt({ ...base, history: ["email: sent intro", "call: left voicemail"] });
    expect(withHistory).toContain("Don't repeat the angle");
  });

  it("omits the anti-repeat directive with no history", () => {
    expect(buildDraftUserPrompt(base)).not.toContain("Don't repeat the angle");
  });
});

describe("batch quality", () => {
  beforeEach(() => {
    delete process.env.SEQUENCE_BATCH_EFFORT;
  });
  it("defaults batched drafts to high effort (close to manual quality)", () => {
    expect(batchEffort()).toBe("high");
  });
  it("honors a valid SEQUENCE_BATCH_EFFORT override and ignores garbage", () => {
    process.env.SEQUENCE_BATCH_EFFORT = "xhigh";
    expect(batchEffort()).toBe("xhigh");
    process.env.SEQUENCE_BATCH_EFFORT = "banana";
    expect(batchEffort()).toBe("high");
  });
});
