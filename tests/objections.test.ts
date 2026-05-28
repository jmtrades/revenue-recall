import { describe, it, expect, beforeEach } from "vitest";
import { INDUSTRIES, type ObjectionKind } from "@/lib/industries";
import { draftReply } from "@/lib/ai/reply";
import { analyzeHumanness } from "@/lib/humanness";
import { AI_TELLS } from "@/lib/copy";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const KINDS: ObjectionKind[] = ["price", "timing", "competitor", "trust", "info"];

function assertClean(text: string, where: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) expect(lower.includes(tell), `${where}: "${tell}" in ${text}`).toBe(false);
}

describe("every industry has a complete, human objection playbook", () => {
  for (const ind of INDUSTRIES) {
    it(`${ind.id} covers all five objection types, each ending on a question`, () => {
      const a = ind.playbook.objectionAngles;
      for (const k of KINDS) {
        expect(a[k], `${ind.id}.${k}`).toBeTruthy();
        expect(a[k].trim().endsWith("?"), `${ind.id}.${k} should end on a question: ${a[k]}`).toBe(true);
        assertClean(a[k], `${ind.id}.${k}`);
        // Lowercase-initial so it composes for SMS.
        expect(a[k][0]).toBe(a[k][0].toLowerCase());
      }
    });
  }
});

describe("objection replies are industry-tailored, human, and reframe-then-ask", () => {
  const incomings: Record<ObjectionKind, string> = {
    price: "honestly that's way too expensive for us",
    timing: "now's not a good time, maybe next quarter",
    competitor: "we already went with another provider",
    trust: "does this actually work? sounds too good to be true",
    info: "can you just send me some info?",
  };

  for (const ind of INDUSTRIES) {
    for (const channel of ["email", "sms"] as const) {
      it(`${ind.id} / ${channel} handles every objection cleanly and ends on a question`, async () => {
        for (const k of KINDS) {
          const out = await draftReply({
            channel,
            contactName: "Jordan Avery",
            dealTitle: "Northside Co",
            industryId: ind.id,
            industryLabel: ind.label,
            incoming: incomings[k],
            voice: { signature: "— Sam" },
          });
          assertClean(out.body, `${ind.id}/${channel}/${k}`);
          expect(analyzeHumanness(out.body).rating, `${ind.id}/${channel}/${k}`).not.toBe("robotic");
          expect(out.body.includes("?"), `${ind.id}/${channel}/${k} reframes into a question`).toBe(true);
          if (channel === "sms") {
            expect(out.body.trim().endsWith("?")).toBe(true); // sms has no sig, so it ends on the ask
            expect(out.body.length).toBeLessThanOrEqual(320);
          } else {
            expect(out.body).toContain("— Sam"); // honors the rep's signature
          }
        }
      });
    }
  }

  it("two different industries reframe the same price objection differently", async () => {
    const re = await draftReply({ channel: "sms", contactName: "Pat", dealTitle: "D", industryId: "real_estate", incoming: "too expensive" });
    const saas = await draftReply({ channel: "sms", contactName: "Pat", dealTitle: "D", industryId: "saas", incoming: "too expensive" });
    expect(re.body).not.toBe(saas.body);
  });
});
