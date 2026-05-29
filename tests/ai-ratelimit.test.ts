import { describe, it, expect, beforeEach } from "vitest";
import { POST as voiceTurn } from "@/app/api/voice/turn/route";
import { POST as inboundEmail } from "@/app/api/inbound/email/route";
import { aiRateLimit, writeRateLimit, _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  delete process.env.AI_RATE_LIMIT_PER_MIN;
  delete process.env.ANTHROPIC_API_KEY; // template path, no real cost
  delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  delete process.env.INBOUND_TOKEN;
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

describe("write-endpoint rate limiting (send/bulk abuse guard)", () => {
  it("writeRateLimit caps a client", () => {
    process.env.WRITE_RATE_LIMIT_PER_MIN = "2";
    const r = new Request("http://x", { headers: { "x-forwarded-for": "7.7.7.7" } });
    expect(writeRateLimit(r, "w").ok).toBe(true);
    expect(writeRateLimit(r, "w").ok).toBe(true);
    expect(writeRateLimit(r, "w").ok).toBe(false);
  });

  it("the inbound-email webhook returns 429 once a client bursts past the limit", async () => {
    process.env.WRITE_RATE_LIMIT_PER_MIN = "3";
    const mk = () =>
      new Request("http://localhost/api/inbound/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
        body: JSON.stringify({ from: "x@y.com", text: "hi" }),
      });
    let last = 200;
    for (let i = 0; i < 4; i++) last = (await inboundEmail(mk())).status;
    expect(last).toBe(429);
  });
});
