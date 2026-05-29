import { describe, it, expect, beforeEach } from "vitest";
import { POST as voiceTurn } from "@/app/api/voice/turn/route";
import { aiRateLimit, _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  delete process.env.AI_RATE_LIMIT_PER_MIN;
  delete process.env.ANTHROPIC_API_KEY; // template path, no real cost
});

function req(ip: string, body: unknown) {
  return new Request("http://localhost/api/voice/turn", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("AI endpoint rate limiting (margin + abuse guard)", () => {
  it("aiRateLimit caps a client and honors the env override", () => {
    process.env.AI_RATE_LIMIT_PER_MIN = "3";
    const r = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    expect(aiRateLimit(r, "t").ok).toBe(true);
    expect(aiRateLimit(r, "t").ok).toBe(true);
    expect(aiRateLimit(r, "t").ok).toBe(true);
    expect(aiRateLimit(r, "t").ok).toBe(false); // 4th over the cap of 3
  });

  it("the voice/turn route returns 429 once a client bursts past the limit", async () => {
    process.env.AI_RATE_LIMIT_PER_MIN = "5";
    const body = { who: "rep", contactName: "Jordan", dealTitle: "Deal", turns: [] };
    let last = 200;
    for (let i = 0; i < 6; i++) {
      const res = await voiceTurn(req("203.0.113.50", body));
      last = res.status;
    }
    expect(last).toBe(429); // the 6th call (limit 5) is throttled
  });

  it("different clients have independent budgets", async () => {
    process.env.AI_RATE_LIMIT_PER_MIN = "1";
    const body = { who: "rep", contactName: "Jordan", dealTitle: "Deal", turns: [] };
    expect((await voiceTurn(req("1.1.1.1", body))).status).not.toBe(429);
    expect((await voiceTurn(req("2.2.2.2", body))).status).not.toBe(429);
    expect((await voiceTurn(req("1.1.1.1", body))).status).toBe(429); // 1.1.1.1 over its cap
  });
});
