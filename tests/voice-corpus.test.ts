import { describe, it, expect, beforeEach } from "vitest";
import { draftMessage, draftVariations, type DraftInput } from "@/lib/ai/draft";
import { draftReply } from "@/lib/ai/reply";
import { analyzeHumanness } from "@/lib/humanness";
import { AI_TELLS } from "@/lib/copy";
import { TONES } from "@/lib/tones";
import { INDUSTRIES } from "@/lib/industries";

// The "could-you-tell?" gate. Generate the deterministic (no-key) output across
// EVERY scenario — industry × tone × channel × cold/warm × re-engagement — and
// hold all of it to a strict human bar: zero AI tells, never robotic, and a high
// average human score. This is the guarantee that the demo path is convincing in
// every case, not just on average.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function hasTell(text: string): string | null {
  const lower = text.toLowerCase();
  return AI_TELLS.find((t) => lower.includes(t)) ?? null;
}

const NAMES = ["Jordan Avery", "Sam Carter", "Pat Diaz"];

describe("voice corpus — indistinguishable across every scenario", () => {
  it("every draft (industry × tone × channel × cold/warm) clears the human bar", async () => {
    let n = 0;
    let scoreSum = 0;
    let humanCount = 0;
    for (const ind of INDUSTRIES) {
      for (const tone of TONES) {
        for (const channel of ["email", "sms", "call"] as const) {
          for (const cold of [true, false]) {
            const input: DraftInput = {
              channel,
              tone: tone.id,
              contactName: NAMES[n % NAMES.length],
              company: "Northside Co",
              dealTitle: "Northside Co",
              valueLabel: "Value",
              value: 42000,
              currency: "USD",
              stageLabel: "Proposal",
              industryLabel: ind.label,
              industryId: ind.id,
              daysSinceContact: cold ? 30 : 4,
              recallReason: cold ? "lost_winnable" : undefined,
              voice: { signature: "— Sam" },
            };
            const out = await draftMessage(input);
            const tell = hasTell(out.body);
            expect(tell, `${ind.id}/${tone.id}/${channel}/${cold}: "${tell}" in ${out.body}`).toBeNull();
            const r = analyzeHumanness(out.body);
            expect(r.rating, `${ind.id}/${tone.id}/${channel}/${cold} robotic: ${out.body}`).not.toBe("robotic");
            scoreSum += r.score;
            if (r.rating === "human") humanCount += 1;
            n += 1;
          }
        }
      }
    }
    const avg = scoreSum / n;
    // Strict bars: the corpus must average near-perfect human, and the vast
    // majority of individual messages must rate fully "human" (not just "stiff").
    expect(n).toBeGreaterThan(300);
    expect(avg, `avg human score ${avg.toFixed(1)} over ${n} messages`).toBeGreaterThanOrEqual(90);
    expect(humanCount / n, `${humanCount}/${n} rated fully human`).toBeGreaterThanOrEqual(0.9);
  });

  it("every reply across every objection × industry × channel clears the bar", async () => {
    const incomings = [
      "your price is way too high for us",
      "not the right time, maybe next quarter",
      "we already went with another provider",
      "does this actually work? sounds too good",
      "just send me some info",
      "not interested, please remove me",
      "what does onboarding look like?",
      "sounds great, thanks for following up",
    ];
    let n = 0;
    let scoreSum = 0;
    for (const ind of INDUSTRIES) {
      for (const channel of ["email", "sms"] as const) {
        for (const incoming of incomings) {
          const out = await draftReply({
            channel,
            contactName: NAMES[n % NAMES.length],
            dealTitle: "Northside Co",
            industryId: ind.id,
            industryLabel: ind.label,
            incoming,
            voice: { signature: "— Sam" },
          });
          const tell = hasTell(out.body);
          expect(tell, `${ind.id}/${channel}: "${tell}" in ${out.body}`).toBeNull();
          const r = analyzeHumanness(out.body);
          expect(r.rating, `${ind.id}/${channel} robotic: ${out.body}`).not.toBe("robotic");
          if (channel === "sms") expect(out.body.length).toBeLessThanOrEqual(320);
          scoreSum += r.score;
          n += 1;
        }
      }
    }
    expect(scoreSum / n).toBeGreaterThanOrEqual(90);
  });

  it("3 variations are genuinely distinct and all human", async () => {
    const variants = await draftVariations(
      {
        channel: "email",
        contactName: "Jordan Avery",
        dealTitle: "Northside Co",
        valueLabel: "Value",
        value: 42000,
        currency: "USD",
        stageLabel: "Proposal",
        industryLabel: "SaaS",
        industryId: "saas",
        daysSinceContact: 20,
        voice: { signature: "— Sam" },
      },
      3,
    );
    expect(variants.length).toBeGreaterThanOrEqual(2); // de-duped, so at least two distinct
    const bodies = new Set(variants.map((v) => v.body));
    expect(bodies.size).toBe(variants.length);
    for (const v of variants) {
      expect(hasTell(v.body)).toBeNull();
      expect(analyzeHumanness(v.body).rating).not.toBe("robotic");
    }
  });
});
