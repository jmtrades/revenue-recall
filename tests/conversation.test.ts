import { describe, it, expect, beforeEach } from "vitest";
import { nextRepTurn, simulateProspect, type ConversationState, type Turn } from "@/lib/voice/conversation";
import { analyzeHumanness } from "@/lib/humanness";
import { AI_TELLS } from "@/lib/copy";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // deterministic engine
});

function clean(text: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) expect(lower.includes(tell), `tell "${tell}" in: ${text}`).toBe(false);
}

function state(turns: Turn[]): ConversationState {
  return { contactName: "Jordan Avery", company: "Northside Co", dealTitle: "Northside Co", industryId: "saas", industryLabel: "SaaS", turns };
}

describe("conversation engine — rep turns", () => {
  it("opens warm and invites them in", async () => {
    const t = await nextRepTurn(state([]));
    expect(t.phase).toBe("opening");
    expect(t.done).toBe(false);
    clean(t.text);
    expect(analyzeHumanness(t.text).rating).not.toBe("robotic");
  });

  it("keeps them talking — objection turns end on a question, with adaptive tone", async () => {
    const objections = [
      "what's this going to cost?",
      "now's not a good time, maybe next quarter",
      "we already went with someone else",
      "does this actually work, sounds too good",
      "just email me some info",
    ];
    for (const incoming of objections) {
      const t = await nextRepTurn(state([{ speaker: "rep", text: "hey, quick one" }, { speaker: "prospect", text: incoming }]));
      expect(t.phase).toBe("handling");
      expect(t.done).toBe(false);
      expect(t.text.trim().endsWith("?"), `${incoming} -> ${t.text}`).toBe(true);
      expect(typeof t.tone).toBe("string");
      expect(typeof t.emotion).toBe("string");
      expect(t.coachNote.length).toBeGreaterThan(0);
      clean(t.text);
    }
  });

  it("reacts to a frustrated prospect with an empathetic, reassuring shift", async () => {
    const t = await nextRepTurn(state([{ speaker: "rep", text: "hey" }, { speaker: "prospect", text: "honestly this is a waste of my time, stop calling" }]));
    expect(t.emotion).toBe("empathetic");
    expect(t.tone).toBe("reassuring");
  });

  it("closes on a concrete next step once there's interest", async () => {
    const turns: Turn[] = [
      { speaker: "rep", text: "hey, caught you at an okay time?" },
      { speaker: "prospect", text: "sure, what's up" },
      { speaker: "rep", text: "wanted to see how things are going" },
      { speaker: "prospect", text: "yeah actually this could be useful" },
      { speaker: "rep", text: "great — what's the main thing you'd want it to fix?" },
      { speaker: "prospect", text: "that sounds good, let's do it" },
    ];
    const t = await nextRepTurn(state(turns));
    expect(t.phase).toBe("closing");
    expect(t.done).toBe(true);
    clean(t.text);
  });

  it("exits graciously on a firm decline", async () => {
    const t = await nextRepTurn(state([{ speaker: "rep", text: "hey" }, { speaker: "prospect", text: "not interested, please don't call again" }]));
    expect(t.phase).toBe("wrap");
    expect(t.done).toBe(true);
    expect(t.text.trim().endsWith("?")).toBe(false);
    clean(t.text);
  });
});

describe("industry-true grounding (no-key path)", () => {
  const mortgage = (turns: Turn[], dealTitle: string): ConversationState => ({
    contactName: "Sam Patel",
    company: "Patel Refi",
    dealTitle,
    industryId: "mortgage",
    industryLabel: "Mortgage & Lending",
    turns,
  });

  it("price objections can land on the vertical's own angle, not just generic lines", async () => {
    // Across deal seeds the pool must surface the mortgage angle at least once,
    // and every variant keeps the question-ending objection contract.
    let sawAngle = false;
    for (let i = 0; i < 12; i++) {
      const t = await nextRepTurn(
        mortgage([{ speaker: "rep", text: "hey, quick one" }, { speaker: "prospect", text: "what's this going to cost?" }], `deal-${i}`),
      );
      expect(t.text.trim().endsWith("?"), t.text).toBe(true);
      clean(t.text);
      if (t.text.includes("what rate were you quoted")) sawAngle = true;
    }
    expect(sawAngle, "mortgage price angle never surfaced across 12 seeds").toBe(true);
  });

  it("role-play prospects raise this industry's real objections", async () => {
    const repTwice: Turn[] = [
      { speaker: "rep", text: "hey, got a sec?" },
      { speaker: "prospect", text: "barely" },
      { speaker: "rep", text: "totally fair, 20 seconds" },
    ];
    const industry = new Set([
      "rates are too high right now",
      "still shopping lenders",
      "waiting on my credit to come up",
      "not sure I'll qualify",
      "the fees look high",
    ]);
    let sawIndustry = false;
    for (let i = 0; i < 16; i++) {
      const p = await simulateProspect(mortgage(repTwice, `deal-${i}`), "medium");
      clean(p.text);
      if (industry.has(p.text)) sawIndustry = true;
    }
    expect(sawIndustry, "no mortgage-native objection surfaced across 16 seeds").toBe(true);
  });
});

describe("prospect simulator (role-play)", () => {
  it("produces a believable opening reaction and harder lines by difficulty", async () => {
    const open = await simulateProspect(state([{ speaker: "rep", text: "hey, quick one — got a sec?" }]), "easy");
    expect(open.text.length).toBeGreaterThan(0);
    clean(open.text);

    const hard = await simulateProspect(
      state([
        { speaker: "rep", text: "hey, got a sec?" },
        { speaker: "prospect", text: "barely" },
        { speaker: "rep", text: "totally fair, 20 seconds" },
      ]),
      "hard",
    );
    expect(hard.text.length).toBeGreaterThan(0);
    expect(typeof hard.intent).toBe("string");
    clean(hard.text);
  });
});
