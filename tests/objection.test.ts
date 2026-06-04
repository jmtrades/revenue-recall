import { describe, it, expect, beforeEach } from "vitest";
import { analyzeProgress, decideDirective } from "@/lib/voice/objection";
import { nextRepTurn, type ConversationState, type Turn } from "@/lib/voice/conversation";

// Phrases below are chosen to classify unambiguously via detectIntent:
//   price: "how much…/…too expensive"  timing: "not the right time"
//   competitor: "already went with someone else"  trust: "does it actually work?"

describe("objection policy (analyzeProgress)", () => {
  it("counts objections, flags a repeated one, and reads the latest intent", () => {
    const p = analyzeProgress(["how much does this cost?", "honestly that's too expensive"]);
    expect(p.objectionCounts.price).toBe(2);
    expect(p.repeatedObjection).toBe("price");
    expect(p.handlingTurns).toBe(2);
    expect(p.lastIntent).toBe("price");
    expect(p.warmedUp).toBe(false);
  });

  it("does not flag distinct objections as repeated, but counts handling turns", () => {
    const p = analyzeProgress(["how much does this cost?", "it's not the right time", "we already went with someone else", "does it actually work?"]);
    expect(p.repeatedObjection).toBeNull();
    expect(p.handlingTurns).toBe(4);
  });
});

describe("objection policy (decideDirective)", () => {
  it("keeps handling a single, fresh objection", () => {
    expect(decideDirective(analyzeProgress(["how much is it?"]), 1).action).toBe("handle");
  });
  it("exits on a firm decline or hostility", () => {
    expect(decideDirective(analyzeProgress(["not interested, no thanks"]), 1)).toEqual({ action: "exit", reason: "declined" });
    expect(decideDirective(analyzeProgress(["stop calling me"]), 1)).toEqual({ action: "exit", reason: "hostile" });
  });
  it("stops re-pitching once the SAME objection repeats — books a callback", () => {
    const d = decideDirective(analyzeProgress(["how much does this cost?", "still, that's too expensive"]), 2);
    expect(d).toEqual({ action: "book_callback", reason: "repeated_objection" });
  });
  it("wraps a dragging call (too many handling turns) to a callback", () => {
    const d = decideDirective(analyzeProgress(["how much does this cost?", "it's not the right time", "we already went with someone else", "does it actually work?"]), 4);
    expect(d).toEqual({ action: "book_callback", reason: "stalled" });
  });
  it("closes on genuine interest", () => {
    expect(decideDirective(analyzeProgress(["yeah, this could really help us"]), 2).action).toBe("close");
  });
});

describe("conversation engine never loops on a repeated objection", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY; // deterministic engine
  });

  function state(turns: Turn[]): ConversationState {
    return { contactName: "Jordan Avery", company: "Northside Co", dealTitle: "Northside Co", industryId: "saas", industryLabel: "SaaS", turns };
  }

  it("a price objection raised twice ends the call with a booked callback, not another pitch", async () => {
    const turns: Turn[] = [
      { speaker: "rep", text: "hey, quick one" },
      { speaker: "prospect", text: "how much does this cost?" },
      { speaker: "rep", text: "it scales to you — what range were you thinking?" },
      { speaker: "prospect", text: "honestly that's just too expensive for us" },
    ];
    const t = await nextRepTurn(state(turns));
    expect(t.done).toBe(true); // the call WRAPS — no third price re-pitch
    expect(t.phase).toBe("closing");
    expect(t.text.toLowerCase()).not.toContain("range");
  });

  it("a call dragging through four objections wraps instead of continuing", async () => {
    const turns: Turn[] = [
      { speaker: "rep", text: "hey" },
      { speaker: "prospect", text: "how much does this cost?" },
      { speaker: "rep", text: "depends — what are you hoping to spend?" },
      { speaker: "prospect", text: "it's not the right time" },
      { speaker: "rep", text: "fair, when's better?" },
      { speaker: "prospect", text: "we already went with someone else" },
      { speaker: "rep", text: "got it — what's missing with them?" },
      { speaker: "prospect", text: "does it actually work?" },
    ];
    const t = await nextRepTurn(state(turns));
    expect(t.done).toBe(true);
    expect(t.phase).toBe("closing");
  });
});
