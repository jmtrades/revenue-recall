import { describe, it, expect } from "vitest";
import { computeTwilioSignature, verifyTwilioSignature } from "@/lib/webhook";

// Official example from Twilio's request-validation docs.
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const TOKEN = "12345";
const PARAMS = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+14158675309",
  Digits: "1234",
  From: "+14158675309",
  To: "+18005551212",
};
const EXPECTED = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

describe("twilio signature", () => {
  it("matches Twilio's documented signature vector", () => {
    expect(computeTwilioSignature(TOKEN, URL, PARAMS)).toBe(EXPECTED);
  });

  it("verifies a correct signature", () => {
    expect(verifyTwilioSignature(TOKEN, URL, PARAMS, EXPECTED)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    expect(verifyTwilioSignature(TOKEN, URL, PARAMS, "wrong-signature")).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyTwilioSignature(TOKEN, URL, PARAMS, null)).toBe(false);
  });

  it("rejects when a param was altered", () => {
    expect(verifyTwilioSignature(TOKEN, URL, { ...PARAMS, Digits: "9999" }, EXPECTED)).toBe(false);
  });
});
