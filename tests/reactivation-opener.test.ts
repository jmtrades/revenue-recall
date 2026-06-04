import { describe, it, expect, beforeEach } from "vitest";
import { nextRepTurn, type ConversationState } from "@/lib/voice/conversation";
import { AI_TELLS } from "@/lib/copy";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // deterministic engine
});

function state(daysSinceContact?: number): ConversationState {
  return { contactName: "Jordan Avery", company: "Northside Co", dealTitle: "Northside Co", industryId: "saas", industryLabel: "SaaS", daysSinceContact, turns: [] };
}

function clean(text: string) {
  const lower = text.toLowerCase();
  for (const tell of AI_TELLS) expect(lower.includes(tell), `tell "${tell}" in: ${text}`).toBe(false);
}

describe("gap-aware reactivation opener", () => {
  it("opens by warmly owning the gap when it's been a real while", async () => {
    const t = await nextRepTurn(state(45));
    expect(t.phase).toBe("opening");
    expect(/\b(while|minute)\b/i.test(t.text), t.text).toBe(true); // acknowledges the gap
    clean(t.text);
  });

  it("cold-opens normally for a fresh deal (no awkward 'it's been a while')", async () => {
    const t = await nextRepTurn(state(2));
    expect(t.phase).toBe("opening");
    expect(/it's been a (while|minute)|been a (while|minute)/i.test(t.text)).toBe(false);
    clean(t.text);
  });
});
