import { describe, it, expect } from "vitest";
import { buildDraftUserPrompt, type DraftInput } from "@/lib/ai/draft";
import { learnVoice } from "@/lib/voice";

const base: DraftInput = {
  channel: "email",
  contactName: "Jordan Avery",
  company: "Northside Co",
  dealTitle: "Q3 rollout",
  valueLabel: "Value",
  value: 40000,
  currency: "USD",
  stageLabel: "Proposal",
  industryLabel: "real_estate",
  industryId: "real_estate",
};

describe("booking-link injection into AI drafts", () => {
  it("offers the exact link, verbatim, when the persona has one", () => {
    const url = "https://cal.com/sam/15min";
    const prompt = buildDraftUserPrompt({ ...base, voice: { bookingUrl: url } });
    expect(prompt).toContain(url);
    expect(prompt).toMatch(/verbatim/i);
    expect(prompt).toMatch(/self-schedule/i);
  });

  it("says nothing about a booking link when the persona has none", () => {
    const prompt = buildDraftUserPrompt({ ...base, voice: { senderName: "Sam" } });
    expect(prompt).not.toMatch(/booking link|self-schedule/i);
    expect(prompt).not.toContain("cal.com");
  });
});

describe("learnVoice carries the booking link through", () => {
  it("trims and returns a provided link; empty string clears it", async () => {
    const saved = await learnVoice({ senderName: "Sam", bookingUrl: "  https://calendly.com/sam  " });
    expect(saved.bookingUrl).toBe("https://calendly.com/sam");

    const cleared = await learnVoice({ senderName: "Sam", bookingUrl: "" });
    expect(cleared.bookingUrl).toBeUndefined();
  });
});
