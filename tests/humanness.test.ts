import { describe, it, expect } from "vitest";
import { analyzeHumanness } from "@/lib/humanness";
import { draftMessage } from "@/lib/ai/draft";
import { INDUSTRIES } from "@/lib/industries";

describe("analyzeHumanness", () => {
  it("scores empty text as fully human", () => {
    expect(analyzeHumanness("").score).toBe(100);
    expect(analyzeHumanness("   ").rating).toBe("human");
  });

  it("flags classic AI tells and rates robotic", () => {
    const r = analyzeHumanness(
      "I hope this email finds you well. I wanted to reach out to circle back and touch base at your earliest convenience.",
    );
    expect(r.rating).toBe("robotic");
    expect(r.score).toBeLessThan(55);
    expect(r.flags.length).toBeGreaterThanOrEqual(3);
  });

  it("flags stiff openers", () => {
    const r = analyzeHumanness("Dear Sir, please be advised that kindly we will proceed.");
    expect(r.flags.some((f) => f.text === "Dear …")).toBe(true);
    expect(r.flags.some((f) => f.text === "kindly")).toBe(true);
  });

  it("flags exclamation spam and em-dash overuse", () => {
    expect(analyzeHumanness("Hey!! This is amazing!! Let's go!!").flags.some((f) => f.text.includes("exclamation"))).toBe(true);
    expect(analyzeHumanness("one — two — three — four").flags.some((f) => f.text.includes("em-dash"))).toBe(true);
  });

  it("flags long formal copy with no contractions", () => {
    const formal =
      "Following our conversation regarding the proposal, I would like to confirm that we remain interested and would appreciate the opportunity to proceed at a mutually convenient time soon please.";
    expect(analyzeHumanness(formal).flags.some((f) => f.text === "no contractions")).toBe(true);
  });

  it("rates a natural, casual message as human", () => {
    const r = analyzeHumanness("hey jess — that 3br on maple came back on. want me to grab you a showing this weekend?");
    expect(r.rating).toBe("human");
    expect(r.flags).toHaveLength(0);
  });

  it("flags timid hedge openers", () => {
    const r = analyzeHumanness("I just wanted to follow up on our chat.");
    expect(r.flags.some((f) => f.text === "I just wanted to")).toBe(true);
  });

  it("flags an even, metronomic rhythm", () => {
    // Four sentences, all ~eight words — the tell-tale AI cadence.
    const even =
      "We can review the plan on Tuesday morning together. You will get the full summary before that call. Our team can answer the open questions then. We will confirm the final budget after that.";
    const r = analyzeHumanness(even);
    expect(r.flags.some((f) => f.text.includes("metronomic"))).toBe(true);
  });

  it("flags repetitive sentence openers", () => {
    const repetitive =
      "I can send that over today. I think it covers everything. I would love your take. I will follow up Friday.";
    const r = analyzeHumanness(repetitive);
    expect(r.flags.some((f) => f.text.includes('start with "i"'))).toBe(true);
  });

  it("does not flag rhythm on short human messages", () => {
    // Two sentences — too short to judge cadence; must stay clean.
    const r = analyzeHumanness("got your note. want me to send the numbers over today?");
    expect(r.flags).toHaveLength(0);
  });

  it("passes the product's own fallback copy as human", async () => {
    // Every deterministic draft we ship should clear the human bar.
    for (const ind of INDUSTRIES) {
      const out = await draftMessage({
        channel: "email",
        contactName: "Jordan Avery",
        company: "Northside Co",
        dealTitle: "Northside Co",
        valueLabel: "Value",
        value: 42000,
        currency: "USD",
        stageLabel: "Proposal",
        industryLabel: ind.label,
        industryId: ind.id,
        daysSinceContact: 30,
        recallReason: "lost_winnable",
        voice: { signature: "— Sam" },
      });
      expect(analyzeHumanness(out.body).rating, `${ind.id} draft should not be robotic`).not.toBe("robotic");
    }
  });
});
