import { describe, it, expect, beforeEach } from "vitest";
import { numbersConfigured, numbersProviderId } from "@/lib/numbers";

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
