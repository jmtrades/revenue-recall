import { describe, it, expect, beforeEach } from "vitest";
import { draftMessage } from "@/lib/ai/draft";
import { analyzeHumanness } from "@/lib/humanness";
import { AI_TELLS } from "@/lib/copy";
import { INDUSTRIES } from "@/lib/industries";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function assertClean(text: string, where: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) expect(lower.includes(tell), `${where}: "${tell}" in ${text}`).toBe(false);
}

const base = {
  contactName: "Jordan Avery",
  company: "Northside Co",
  dealTitle: "Northside Co",
  valueLabel: "Value",
  value: 42000,
  currency: "USD",
  stageLabel: "Proposal",
  industryLabel: "SaaS",
  industryId: "saas",
  repName: "Sam",
} as const;

describe("voicemail scenario", () => {
  it("is short, spoken, human, and clean across industries", async () => {
    for (const ind of INDUSTRIES) {
      const out = await draftMessage({ ...base, industryId: ind.id, industryLabel: ind.label, channel: "call", scenario: "voicemail" });
      expect(out.source).toBe("template");
      assertClean(out.body, `${ind.id} voicemail`);
      expect(analyzeHumanness(out.body).rating).not.toBe("robotic");
      expect(out.body.length).toBeLessThan(280); // short, leave-able
      expect(out.body).toContain("Jordan"); // personalized
    }
  });
});

describe("breakup / last-touch scenario", () => {
  it("email is gracious, clean, signed, and not pushy (no question)", async () => {
    const out = await draftMessage({ ...base, channel: "email", scenario: "breakup", voice: { signature: "— Sam" } });
    assertClean(out.body, "breakup email");
    expect(analyzeHumanness(out.body).rating).not.toBe("robotic");
    expect(out.body).toContain("— Sam");
    expect(out.subject).toBeTruthy();
    expect(out.body.includes("?")).toBe(false); // a breakup doesn't pressure with a question
  });

  it("sms is short, clean, and gracious across industries", async () => {
    for (const ind of INDUSTRIES) {
      const out = await draftMessage({ ...base, industryId: ind.id, industryLabel: ind.label, channel: "sms", scenario: "breakup" });
      assertClean(out.body, `${ind.id} breakup sms`);
      expect(out.body.length).toBeLessThanOrEqual(320);
      expect(analyzeHumanness(out.body).rating).not.toBe("robotic");
    }
  });
});

describe("referral / recap / renewal / reschedule scenarios", () => {
  const scenarios = ["referral", "recap", "renewal", "reschedule"] as const;

  it("each is clean, human, and personalized across industries and channels", async () => {
    for (const ind of INDUSTRIES) {
      for (const channel of ["email", "sms"] as const) {
        for (const scenario of scenarios) {
          const out = await draftMessage({ ...base, industryId: ind.id, industryLabel: ind.label, channel, scenario, voice: { signature: "— Sam" } });
          expect(out.source).toBe("template");
          assertClean(out.body, `${ind.id}/${channel}/${scenario}`);
          expect(analyzeHumanness(out.body).rating).not.toBe("robotic");
          if (channel === "sms") expect(out.body.length).toBeLessThanOrEqual(320);
          else {
            expect(out.subject).toBeTruthy();
            expect(out.body).toContain("— Sam");
          }
        }
      }
    }
  });

  it("invites a reply — each ends on a question", async () => {
    for (const scenario of scenarios) {
      const out = await draftMessage({ ...base, channel: "sms", scenario });
      expect(out.body.trim().endsWith("?"), `${scenario}: ${out.body}`).toBe(true);
    }
  });
});
