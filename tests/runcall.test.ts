import { describe, it, expect, beforeEach } from "vitest";
import { runCall, type ConversationState } from "@/lib/voice/conversation";
import { AI_TELLS } from "@/lib/copy";

// Deterministic engine (no API key): drives a whole call to completion.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function state(): ConversationState {
  return { contactName: "Jordan Avery", company: "Northside Co", dealTitle: "Northside Co", industryId: "saas", industryLabel: "SaaS", turns: [] };
}

function assertClean(turns: { text: string }[]) {
  for (const t of turns) {
    const lower = t.text.toLowerCase();
    for (const tell of AI_TELLS) expect(lower.includes(tell), `tell "${tell}" in: ${t.text}`).toBe(false);
  }
}

describe("full-call driver", () => {
  it("runs a complete call: opens, alternates, terminates, and scores it", async () => {
    const r = await runCall(state(), { difficulty: "medium", maxRepTurns: 12 });
    expect(r.repTurns).toBeGreaterThanOrEqual(1);
    expect(r.repTurns).toBeLessThanOrEqual(12);
    expect(["closed", "ended", "capped"]).toContain(r.endedBy);
    // First turn is the rep opening; turns strictly alternate rep/prospect.
    expect(r.turns[0].speaker).toBe("rep");
    for (let i = 1; i < r.turns.length; i++) expect(r.turns[i].speaker).not.toBe(r.turns[i - 1].speaker);
    // A coaching beat per rep turn, and a scorecard.
    expect(r.beats.length).toBe(r.repTurns);
    expect(r.beats.every((b) => b.coachNote.length > 0)).toBe(true);
    expect(["A", "B", "C", "D", "F"]).toContain(r.score.grade);
    assertClean(r.turns);
  });

  it("always terminates even against a hard, resistant prospect", async () => {
    const r = await runCall(state(), { difficulty: "hard", maxRepTurns: 8 });
    expect(r.repTurns).toBeLessThanOrEqual(8);
    expect(r.turns.length).toBeGreaterThan(0);
    assertClean(r.turns);
  });

  it("ends gracefully (not capped) when the prospect declines early", async () => {
    const declined: ConversationState = {
      ...state(),
      turns: [
        { speaker: "rep", text: "Hey Jordan, caught you at an okay time?" },
        { speaker: "prospect", text: "not interested, please remove me and don't contact me again" },
      ],
    };
    const r = await runCall(declined, { maxRepTurns: 6 });
    expect(r.endedBy).toBe("ended"); // graceful wrap, not the safety cap
    expect(r.repTurns).toBe(1);
  });

  it("respects the rep voice profile passed in state", async () => {
    const r = await runCall({ ...state(), tone: "direct", voice: { senderName: "Sam", profile: "short, warm, lots of questions" } }, { maxRepTurns: 4 });
    expect(r.turns.length).toBeGreaterThan(0);
  });

  it("every spoken rep line stays clean across many full calls (corpus gate)", async () => {
    // Drive lots of calls so every SPOKEN branch (open/objection/close/wrap) is hit.
    for (let i = 0; i < 25; i++) {
      const difficulty = (["easy", "medium", "hard"] as const)[i % 3];
      const r = await runCall({ contactName: `Person ${i}`, dealTitle: `Deal ${i}`, industryId: "saas", industryLabel: "SaaS", turns: [] }, { difficulty, maxRepTurns: 14 });
      for (const t of r.turns) {
        if (t.speaker !== "rep") continue; // only assert on what WE generate
        const lower = t.text.toLowerCase();
        for (const tell of AI_TELLS) expect(lower.includes(tell), `call ${i} (${difficulty}) rep tell "${tell}": ${t.text}`).toBe(false);
      }
    }
  });
});
