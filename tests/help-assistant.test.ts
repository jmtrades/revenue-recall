import { describe, it, expect, beforeEach } from "vitest";
import { POST as helpChat } from "@/app/api/help/chat/route";
import { fallbackAnswer, HELP_SYSTEM_PROMPT, HELP_TOPICS, SUGGESTED_QUESTIONS } from "@/lib/help/knowledge";
import { _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  delete process.env.ANTHROPIC_API_KEY; // force the deterministic curated path
});

function ask(body: unknown, { origin = "https://app.test", host = "app.test", ip = "5.5.5.5" }: { origin?: string | null; host?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-host": host, "x-forwarded-for": ip };
  if (origin) headers["origin"] = origin;
  return new Request("https://app.test/api/help/chat", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("help knowledge — the grounding behind the assistant", () => {
  it("routes the common questions to the right curated answer", () => {
    expect(fallbackAnswer("How do I start calling?")).toMatch(/Power Dialer/);
    expect(fallbackAnswer("how much does it cost")).toMatch(/free|plan|Pricing/i);
    expect(fallbackAnswer("import my leads from a csv")).toMatch(/CSV|Import/i);
    expect(fallbackAnswer("teach it my voice")).toMatch(/Voice/i);
    expect(fallbackAnswer("what does autopilot do")).toMatch(/Autopilot/i);
  });

  it("falls back to a helpful default for an unknown question", () => {
    const a = fallbackAnswer("zxcv qwer asdf");
    expect(a).toMatch(/Go Live|start calling|import/i);
  });

  it("never leaks the underlying vendors, in the prompt or any answer (white-label)", () => {
    const corpus = [HELP_SYSTEM_PROMPT, ...HELP_TOPICS.map((t) => t.answer)].join("\n").toLowerCase();
    for (const vendor of ["elevenlabs", "anthropic", "twilio", "claude", "openai", "cartesia"]) {
      expect(corpus, `must not name ${vendor}`).not.toContain(vendor);
    }
  });

  it("does not expose divisible unit counts in pricing copy (value, not arithmetic)", () => {
    const billing = HELP_TOPICS.find((t) => t.id === "billing")!.answer;
    expect(billing).not.toMatch(/\d[\d,]*\s*(minutes|messages|texts|calls|credits)/i);
  });

  it("ships a small set of starter questions including how to call", () => {
    expect(SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(SUGGESTED_QUESTIONS.some((q) => /call/i.test(q))).toBe(true);
  });
});

describe("help assistant route — public, guarded, inert-without-config", () => {
  it("answers a real question with the curated reply when no AI key is set", async () => {
    const res = await helpChat(ask({ messages: [{ role: "user", content: "How do I start calling?" }] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reply: string; source: string };
    expect(data.source).toBe("guide");
    expect(data.reply).toMatch(/Power Dialer/);
  });

  it("blocks a cross-origin POST (CSRF defense-in-depth on a public route)", async () => {
    const res = await helpChat(ask({ messages: [{ role: "user", content: "hi" }] }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("blocks a POST with neither Origin nor Referer (fails closed)", async () => {
    const res = await helpChat(ask({ messages: [{ role: "user", content: "hi" }] }, { origin: null }));
    expect(res.status).toBe(403);
  });

  it("rejects a malformed body", async () => {
    expect((await helpChat(ask({ nope: true }))).status).toBe(400);
    expect((await helpChat(ask({ messages: [] }))).status).toBe(400);
    expect((await helpChat(ask({ messages: [{ role: "system", content: "x" }] }))).status).toBe(400);
  });
});
