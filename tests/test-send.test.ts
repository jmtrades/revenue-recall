import { describe, it, expect, beforeEach } from "vitest";
import { POST as testSend } from "@/app/api/test-send/route";
import { _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  delete process.env.WRITE_RATE_LIMIT_PER_MIN;
  // No provider configured → log transport.
  for (const k of ["RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_WEBHOOK_URL", "SMS_WEBHOOK_URL", "TWILIO_ACCOUNT_SID"]) delete process.env[k];
});

function req(body: unknown) {
  return new Request("http://localhost/api/test-send", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.5" },
    body: JSON.stringify(body),
  });
}

describe("test-send endpoint", () => {
  it("reports the resolved provider + status (logged when nothing connected)", async () => {
    const res = await testSend(req({ channel: "email", to: "you@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provider).toBe("log");
    expect(data.status).toBe("logged");
  });

  it("rejects an invalid payload", async () => {
    expect((await testSend(req({ channel: "fax", to: "x" }))).status).toBe(400);
    expect((await testSend(req({ channel: "email" }))).status).toBe(400);
  });
});
