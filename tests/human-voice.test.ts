import { describe, it, expect } from "vitest";
import { INDUSTRIES, getPlaybook } from "@/lib/industries";
import { AI_TELLS, pickVariant } from "@/lib/copy";
import { draftMessage, type DraftInput } from "@/lib/ai/draft";
import { draftReply } from "@/lib/ai/reply";
import { TEMPLATES } from "@/lib/templates";
import { SEQUENCES } from "@/lib/sequences";

// These tests run with no ANTHROPIC_API_KEY, so every generator returns its
// deterministic human fallback — exactly what the demo shows.

function assertNoTells(text: string, where: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) {
    expect(lower.includes(tell), `${where} contains AI tell "${tell}": ${text}`).toBe(false);
  }
}

const CHANNELS: DraftInput["channel"][] = ["email", "sms", "call"];

function baseInput(industryId: string, channel: DraftInput["channel"], cold: boolean): DraftInput {
  return {
    channel,
    contactName: "Jordan Avery",
    company: "Northside Co",
    dealTitle: "Northside Co — Jordan Avery",
    valueLabel: "Value",
    value: 42000,
    currency: "USD",
    stageLabel: "Proposal",
    industryLabel: industryId,
    industryId,
    daysSinceContact: cold ? 28 : 2,
    recallReason: cold ? "lost_winnable" : undefined,
  };
}

describe("draft fallback sounds human across every industry", () => {
  for (const ind of INDUSTRIES) {
    for (const channel of CHANNELS) {
      for (const cold of [true, false]) {
        it(`${ind.id} / ${channel} / ${cold ? "cold" : "warm"} has no AI tells`, async () => {
          const out = await draftMessage(baseInput(ind.id, channel, cold));
          expect(out.source).toBe("template");
          assertNoTells(out.body, `${ind.id}/${channel}`);
          if (out.subject) assertNoTells(out.subject, `${ind.id}/${channel} subject`);
        });
      }
    }
  }
});

describe("draft fallback is industry-aware", () => {
  it("uses the industry's own next-step language", async () => {
    const re = await draftMessage(baseInput("real_estate", "sms", false));
    const pb = getPlaybook("real_estate");
    expect(pb.nextSteps.sms.some((s) => re.body.includes(s))).toBe(true);
  });

  it("produces different copy for different industries", async () => {
    const re = await draftMessage(baseInput("real_estate", "email", true));
    const saas = await draftMessage(baseInput("saas", "email", true));
    expect(re.body).not.toBe(saas.body);
  });
});

describe("reply fallback sounds human and answers intent", () => {
  const cases: { incoming: string; label: string }[] = [
    { incoming: "Not interested, we went with someone else.", label: "decline" },
    { incoming: "How much does this actually cost?", label: "question" },
    { incoming: "Sounds good, thanks for following up.", label: "positive" },
  ];
  for (const ind of INDUSTRIES) {
    for (const channel of ["email", "sms"] as const) {
      for (const c of cases) {
        it(`${ind.id} / ${channel} / ${c.label} has no AI tells`, async () => {
          const out = await draftReply({
            channel,
            contactName: "Jordan Avery",
            dealTitle: "Northside Co",
            industryId: ind.id,
            industryLabel: ind.label,
            incoming: c.incoming,
          });
          expect(out.source).toBe("template");
          assertNoTells(out.body, `${ind.id}/${channel}/${c.label}`);
          if (out.subject) assertNoTells(out.subject, "reply subject");
        });
      }
    }
  }
});

describe("template & sequence libraries are clean", () => {
  it("no template contains an AI tell", () => {
    for (const t of TEMPLATES) {
      assertNoTells(t.body, `template ${t.id}`);
      if (t.subject) assertNoTells(t.subject, `template ${t.id} subject`);
    }
  });
  it("no sequence step contains an AI tell", () => {
    for (const s of SEQUENCES) {
      for (const step of s.steps) {
        assertNoTells(step.body, `sequence ${s.id}`);
        assertNoTells(step.subject, `sequence ${s.id} subject`);
      }
    }
  });
});

describe("every industry has a complete playbook", () => {
  for (const ind of INDUSTRIES) {
    it(`${ind.id} playbook is filled out`, () => {
      const pb = ind.playbook;
      expect(pb.buyerGoal.length).toBeGreaterThan(0);
      expect(pb.repRole.length).toBeGreaterThan(0);
      expect(pb.objections.length).toBeGreaterThanOrEqual(3);
      expect(pb.reengage.length).toBeGreaterThanOrEqual(2);
      expect(pb.sampleVoice.length).toBeGreaterThanOrEqual(2);
      expect(pb.vocabulary.length).toBeGreaterThanOrEqual(4);
      for (const ch of ["email", "sms", "call"] as const) {
        expect(pb.nextSteps[ch].length, `${ind.id} ${ch} next steps`).toBeGreaterThanOrEqual(3);
      }
      // Sample voice lines should themselves be clean.
      for (const line of pb.sampleVoice) assertNoTells(line, `${ind.id} sampleVoice`);
    });
  }
});

describe("workspace playbook overrides", () => {
  it("uses the workspace's own next-step lines in drafts when set", async () => {
    const custom = "want me to send the signed paperwork over today?";
    const out = await draftMessage({
      ...baseInput("real_estate", "sms", false),
      voice: { customNextSteps: [custom] },
    });
    expect(out.body.includes(custom)).toBe(true);
  });

  it("uses the workspace's own re-engagement openers when cold", async () => {
    const opener = "noticed it's been a minute since we connected";
    const out = await draftMessage({
      ...baseInput("saas", "email", true),
      voice: { customReengage: [opener], customNextSteps: ["want to hop on a quick call?"] },
    });
    expect(out.body.toLowerCase()).toContain("noticed it's been a minute");
    assertNoTells(out.body, "override draft");
  });
});

describe("pickVariant", () => {
  it("is deterministic for a seed and varies across seeds", () => {
    const opts = ["a", "b", "c", "d", "e"];
    expect(pickVariant(opts, "deal-1")).toBe(pickVariant(opts, "deal-1"));
    const picks = new Set(["deal-1", "deal-2", "deal-3", "deal-4", "deal-5"].map((s) => pickVariant(opts, s)));
    expect(picks.size).toBeGreaterThan(1);
  });
});
