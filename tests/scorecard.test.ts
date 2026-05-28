import { describe, it, expect } from "vitest";
import { analyzeCall } from "@/lib/voice/scorecard";
import type { Turn } from "@/lib/voice/conversation";

const t = (speaker: "rep" | "prospect", text: string): Turn => ({ speaker, text });

describe("call scorecard", () => {
  it("rewards a balanced call that handles objections and books a next step", () => {
    const turns: Turn[] = [
      t("rep", "Hey, caught you at an okay time?"),
      t("prospect", "sure, I've got a couple of minutes, what's this about exactly?"),
      t("rep", "Wanted to see how things are going — what's the priority right now?"),
      t("prospect", "honestly the price feels a bit high for where we're at right now"),
      t("rep", "Fair — it scales to what you need. What budget are you working with?"),
      t("prospect", "yeah, that actually makes sense when you put it that way, sounds reasonable"),
      t("rep", "Great — want to grab 15 minutes Thursday at 2pm to walk through it?"),
      t("prospect", "yeah Thursday at 2 works for me, go ahead and send the invite"),
    ];
    const s = analyzeCall(turns);
    expect(s.nextStepSecured).toBe(true);
    expect(s.objections.find((o) => o.intent === "price")?.handled).toBe(true);
    expect(s.questionsAsked).toBeGreaterThanOrEqual(2);
    expect(["A", "B"]).toContain(s.grade);
  });

  it("penalizes a monologue with no questions and no next step", () => {
    const long = "we are the best and we do everything and our product is amazing and it has so many features and ".repeat(4);
    const turns: Turn[] = [
      t("rep", "Hi there."),
      t("prospect", "ok"),
      t("rep", long),
      t("prospect", "uh huh"),
      t("rep", "So yeah that's us."),
      t("prospect", "ok bye"),
    ];
    const s = analyzeCall(turns);
    expect(s.talkRatio).toBeGreaterThan(0.7);
    expect(s.longestMonologue).toBeGreaterThan(60);
    expect(s.nextStepSecured).toBe(false);
    expect(["D", "F"]).toContain(s.grade);
    expect(s.tips.length).toBeGreaterThan(0);
  });

  it("flags an unhandled objection", () => {
    const turns: Turn[] = [
      t("rep", "Hey, quick one."),
      t("prospect", "that's way too expensive"),
      // rep doesn't engage — trails off
      t("prospect", "hello?"),
    ];
    const s = analyzeCall(turns);
    const price = s.objections.find((o) => o.intent === "price");
    expect(price?.handled).toBe(false);
    expect(s.tips.some((x) => x.toLowerCase().includes("objection"))).toBe(true);
  });

  it("detects sentiment cooling and warming", () => {
    const cooled = analyzeCall([t("rep", "hi"), t("prospect", "sure sounds good"), t("rep", "great"), t("prospect", "actually not interested, this is a waste of time")]);
    expect(cooled.sentimentArc).toBe("cooled");
    const warmed = analyzeCall([t("rep", "hi"), t("prospect", "not interested"), t("rep", "fair, what changed?"), t("prospect", "actually this sounds amazing, let's do it")]);
    expect(warmed.sentimentArc).toBe("warmed");
  });

  it("handles an empty transcript safely", () => {
    const s = analyzeCall([]);
    expect(s.talkRatio).toBe(0);
    expect(s.objections).toEqual([]);
    expect(s.grade).toBeTruthy();
  });
});
