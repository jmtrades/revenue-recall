import { describe, it, expect } from "vitest";
import { draftMessage, draftVariations, AI_TELLS } from "@/lib/ai/draft";
import { draftReply } from "@/lib/ai/reply";
import { summarizeDeal } from "@/lib/ai/brief";

/**
 * LIVE AI smoke test — actually calls the Anthropic API to prove the drafting,
 * reply, brief, and variation features produce real, in-voice output on the
 * configured model (not just that the plumbing is wired). OFF by default so the
 * normal suite stays offline and free; run it explicitly:
 *
 *   AI_LIVE_SMOKE=1 ANTHROPIC_API_KEY=sk-ant-... npm run smoke:ai
 *
 * Each call costs a few hundred tokens. Asserts source === "ai" (so a silent
 * fallback to templates fails the test) and that output is non-empty and free
 * of the worst AI tells.
 */

const LIVE = process.env.AI_LIVE_SMOKE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);
const T = { timeout: 90_000 };

/** A handful of the most egregious tells — output containing these reads as AI. */
const WORST_TELLS = ["I hope this email finds you well", "I wanted to reach out", "circle back", "touch base", "synergy", "leverage our"];
function hasWorstTell(text: string): string | null {
  const lower = text.toLowerCase();
  return WORST_TELLS.find((t) => lower.includes(t.toLowerCase())) ?? null;
}

const baseDraft = {
  channel: "email" as const,
  contactName: "Jordan Lee",
  company: "Acme Tools",
  dealTitle: "Acme — Q3 rollout",
  valueLabel: "ARR",
  value: 24000,
  currency: "USD",
  stageLabel: "Proposal",
  industryLabel: "SaaS",
  industryId: "saas",
};

describe.skipIf(!LIVE)("live AI features", () => {
  it("drafts a real in-voice email (source=ai, no worst tells)", T, async () => {
    const out = await draftMessage({ ...baseDraft, daysSinceContact: 12, recallReason: "going_cold", lastInbound: "We're comparing a couple of options this quarter — can you send pricing?" });
    expect(out.source).toBe("ai");
    expect(out.subject && out.subject.length).toBeTruthy();
    expect(out.body.length).toBeGreaterThan(30);
    const tell = hasWorstTell(`${out.subject} ${out.body}`);
    expect(tell, `output contained an AI tell: ${tell}`).toBeNull();
    // eslint-disable-next-line no-console
    console.log(`\n[draft email]\nSubject: ${out.subject}\n${out.body}\n`);
  });

  it("produces distinct variations", T, async () => {
    const outs = await draftVariations({ ...baseDraft, channel: "sms", daysSinceContact: 20 }, 3);
    expect(outs.length).toBeGreaterThanOrEqual(2);
    expect(outs.every((o) => o.body.length > 0)).toBe(true);
    const bodies = new Set(outs.map((o) => o.body));
    expect(bodies.size, "variations should be distinct").toBeGreaterThan(1);
  });

  it("drafts a reply that answers what they actually said", T, async () => {
    const out = await draftReply({ channel: "email", contactName: "Pat Diaz", dealTitle: "Acme — Q3 rollout", industryId: "saas", incoming: "This looks solid but it's over our budget. Can you do anything on price?" });
    expect(out.source).toBe("ai");
    expect(out.body.length).toBeGreaterThan(20);
    // eslint-disable-next-line no-console
    console.log(`\n[reply]\n${out.body}\n`);
  });

  it("writes a deal brief", T, async () => {
    const out = await summarizeDeal({
      contactName: "Jordan Lee", company: "Acme Tools", dealTitle: "Acme — Q3 rollout", valueLabel: "ARR",
      value: 24000, currency: "USD", stageLabel: "Proposal", stageType: "open", industryLabel: "SaaS", daysSinceContact: 12,
      history: ["email (they wrote): can you send pricing?", "call (you sent): walked through the rollout plan"],
    });
    expect(out.source).toBe("ai");
    expect(out.summary.length).toBeGreaterThan(20);
    // eslint-disable-next-line no-console
    console.log(`\n[brief]\n${out.summary}\n`);
  });
});

// Keep the file a valid suite when skipped offline.
describe("live AI smoke harness", () => {
  it.skipIf(LIVE)("is skipped unless AI_LIVE_SMOKE=1 + a key (expected offline)", () => {
    expect(LIVE).toBe(false);
    expect(Array.isArray(AI_TELLS)).toBe(true);
  });
});
