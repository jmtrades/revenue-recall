import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { channelStatus, configuredEmailFrom, setEmailTransport } from "@/lib/comms";

const KEYS = ["RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_WEBHOOK_URL", "EMAIL_FROM"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  setEmailTransport(null); // no injected custom transport
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setEmailTransport(null);
});

describe("email deliverability: a real EMAIL_FROM is required to go live", () => {
  it("configuredEmailFrom ignores the placeholder and an unset value", () => {
    expect(configuredEmailFrom()).toBeUndefined();
    process.env.EMAIL_FROM = "sales@example.com";
    expect(configuredEmailFrom()).toBeUndefined();
    process.env.EMAIL_FROM = "hi@realco.com";
    expect(configuredEmailFrom()).toBe("hi@realco.com");
  });

  it("email is NOT live with an API key but no real from — so 'Live' never lies", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(channelStatus().email.live).toBe(false); // would otherwise bounce from example.com
    process.env.EMAIL_FROM = "sales@example.com";
    expect(channelStatus().email.live).toBe(false);
    process.env.EMAIL_FROM = "hi@realco.com";
    expect(channelStatus().email.live).toBe(true);
  });
});
