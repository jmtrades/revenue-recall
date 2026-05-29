import { describe, it, expect, beforeEach } from "vitest";
import { TONES, DEFAULT_TONE, getTone, isToneId } from "@/lib/tones";
import { draftMessage } from "@/lib/ai/draft";
import { draftReply, detectIntent } from "@/lib/ai/reply";
import { analyzeHumanness } from "@/lib/humanness";
import { AI_TELLS } from "@/lib/copy";
import { INDUSTRIES } from "@/lib/industries";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // exercise the deterministic fallbacks
});

function assertClean(text: string, where: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) {
    expect(lower.includes(tell), `${where} contains AI tell "${tell}": ${text}`).toBe(false);
  }
}

describe("tone catalog", () => {
  it("has a default and well-formed entries", () => {
    expect(TONES.length).toBeGreaterThanOrEqual(5);
    expect(TONES.some((t) => t.id === DEFAULT_TONE)).toBe(true);
    for (const t of TONES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.directive.length).toBeGreaterThan(0);
    }
  });

  it("getTone falls back to the first tone for unknown ids; isToneId guards", () => {
    expect(getTone("nonsense").id).toBe(TONES[0].id);
    expect(getTone(undefined).id).toBe(TONES[0].id);
    expect(isToneId("direct")).toBe(true);
    expect(isToneId("smooth-jazz")).toBe(false);
  });
});

describe("tone changes fallback output and stays human", () => {
  const base = {
    channel: "email" as const,
    contactName: "Jordan Avery",
    company: "Northside Co",
    dealTitle: "Northside Co",
    valueLabel: "Value",
    value: 42000,
    currency: "USD",
    stageLabel: "Proposal",
    industryLabel: "SaaS",
    industryId: "saas",
    daysSinceContact: 5,
  };

  it("different tones produce different (still clean, still human) drafts", async () => {
    const warm = await draftMessage({ ...base, tone: "warm" });
    const direct = await draftMessage({ ...base, tone: "direct" });
    const confident = await draftMessage({ ...base, tone: "confident" });
    const bodies = [warm.body, direct.body, confident.body];
    // At least two of the three differ — tone is folded into the seed.
    expect(new Set(bodies).size).toBeGreaterThan(1);
    for (const b of bodies) {
      assertClean(b, "toned draft");
      expect(analyzeHumanness(b).rating).not.toBe("robotic");
    }
  });

  it("every tone stays clean across channels", async () => {
    for (const t of TONES) {
      for (const channel of ["email", "sms", "call"] as const) {
        const out = await draftMessage({ ...base, channel, tone: t.id });
        assertClean(out.body, `${t.id}/${channel}`);
      }
    }
  });
});

describe("objection handling", () => {
  const samples: { incoming: string; expected: ReturnType<typeof detectIntent> }[] = [
    { incoming: "honestly your price is way too expensive for us", expected: "price" },
    { incoming: "now's not the right time, maybe next quarter", expected: "timing" },
    { incoming: "we already went with another provider", expected: "competitor" },
    { incoming: "does this actually work? sounds too good to be true", expected: "trust" },
    { incoming: "can you just send me some info?", expected: "info" },
    { incoming: "not interested, please remove me", expected: "decline" },
    { incoming: "what's the onboarding like?", expected: "question" },
    { incoming: "sounds great, thanks for following up", expected: "positive" },
  ];

  it("classifies each objection correctly", () => {
    for (const s of samples) {
      expect(detectIntent(s.incoming), s.incoming).toBe(s.expected);
    }
  });

  it("answers every objection cleanly and humanly, across industries and channels", async () => {
    for (const ind of INDUSTRIES) {
      for (const channel of ["email", "sms"] as const) {
        for (const s of samples) {
          const out = await draftReply({
            channel,
            contactName: "Jordan Avery",
            dealTitle: "Northside Co",
            industryId: ind.id,
            industryLabel: ind.label,
            incoming: s.incoming,
            voice: { signature: "— Sam" },
          });
          expect(out.source).toBe("template");
          assertClean(out.body, `${ind.id}/${channel}/${s.expected}`);
          expect(analyzeHumanness(out.body).rating, `${ind.id}/${channel}/${s.expected}`).not.toBe("robotic");
          if (channel === "sms") expect(out.body.length).toBeLessThanOrEqual(320);
        }
      }
    }
  });

  it("objection replies end on a question (they keep the conversation going)", async () => {
    for (const obj of ["price", "timing", "competitor", "trust", "info"] as const) {
      const incoming = {
        price: "too expensive",
        timing: "not right now",
        competitor: "we went with someone else already",
        trust: "does it really work",
        info: "send me info",
      }[obj];
      const out = await draftReply({ channel: "sms", contactName: "Pat", dealTitle: "Deal", industryId: "generic", incoming });
      expect(out.body.trim().endsWith("?"), `${obj}: ${out.body}`).toBe(true);
    }
  });

  it("a decline exits graciously without pushing a next step", async () => {
    const out = await draftReply({ channel: "email", contactName: "Pat", dealTitle: "Deal", industryId: "generic", incoming: "not interested, please remove me", voice: { signature: "— Sam" } });
    expect(out.body).toContain("— Sam");
    expect(out.body.trim().endsWith("?")).toBe(false);
  });
});
