import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { numbersConfigured, numbersProviderId, buyNumber } from "@/lib/numbers";

beforeEach(() => {
  delete process.env.NUMBERS_WEBHOOK_URL;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});

describe("number provider resolution", () => {
  it("uses the built-in Twilio provider when its creds are set (buy numbers in-app)", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token_test";
    expect(numbersConfigured()).toBe(true);
    expect(numbersProviderId()).toBe("twilio");
  });

  it("prefers an explicit NUMBERS_WEBHOOK_URL over Twilio", () => {
    process.env.NUMBERS_WEBHOOK_URL = "https://hook.example.com/numbers";
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token_test";
    expect(numbersProviderId()).toBe("webhook");
  });

  it("reports none when nothing is connected", () => {
    expect(numbersConfigured()).toBe(false);
    expect(numbersProviderId()).toBe("none");
  });
});

describe("buying wires the number so it works immediately", () => {
  const orig = global.fetch;
  afterEach(() => {
    global.fetch = orig;
  });

  it("sends the inbound SMS + voice webhooks to Twilio at purchase", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token_test";
    let captured = "";
    global.fetch = (async (_url: unknown, init: { body?: string }) => {
      captured = String(init?.body ?? "");
      return new Response(JSON.stringify({ phone_number: "+15551230000", friendly_name: "RR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const bought = await buyNumber("+15551230000", {
      smsUrl: "https://app.example/api/inbound/sms?org=o1&t=tok",
      voiceUrl: "https://gw.example/voice",
    });
    expect(bought.number).toBe("+15551230000");
    // The purchase request carries the webhooks — so inbound texts/calls route
    // back to the org instead of dead-ending on a fresh number.
    expect(captured).toContain("SmsUrl");
    expect(captured).toContain("VoiceUrl");
    expect(decodeURIComponent(captured)).toContain("/api/inbound/sms?org=o1");
  });
});
