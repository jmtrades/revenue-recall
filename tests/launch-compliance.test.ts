import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { launchStatus } from "@/lib/launch";

// Make email "live" the way comms.ts decides it: a Resend key + a real
// EMAIL_FROM. Then toggle the postal address to assert the CAN-SPAM warning.
const SAVED = { ...process.env };

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.COMPLIANCE_ADDRESS;
  delete process.env.OUTBOUND_COMPLIANCE;
  delete process.env.SIGNUP_REQUIRE_EMAIL_CONFIRM;
});
afterEach(() => {
  process.env = { ...SAVED };
});

const addressWarning = (s: { warnings: string[] }) => s.warnings.some((w) => /postal address|CAN-SPAM/i.test(w));

describe("launchStatus — CAN-SPAM postal address", () => {
  it("warns when email is live but no postal address is set", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "sales@acme.com";
    expect(addressWarning(launchStatus())).toBe(true);
  });

  it("clears the warning once a postal address is configured", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "sales@acme.com";
    process.env.COMPLIANCE_ADDRESS = "1 Main St, Springfield, IL";
    expect(addressWarning(launchStatus())).toBe(false);
  });

  it("does not warn about an address when no email channel is live", () => {
    // No RESEND/EMAIL_FROM → email logs only; the address warning would be noise.
    expect(addressWarning(launchStatus())).toBe(false);
  });

  it("does not warn when compliance footers are explicitly disabled", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "sales@acme.com";
    process.env.OUTBOUND_COMPLIANCE = "false"; // operator appends their own
    expect(addressWarning(launchStatus())).toBe(false);
  });
});

describe("launchStatus — signup email confirmation (Supabase SMTP)", () => {
  const confirmWarning = (s: { warnings: string[] }) => s.warnings.some((w) => /email confirmation|Supabase Auth's SMTP/i.test(w));

  it("warns when signup requires email confirmation (relies on Supabase Auth SMTP)", () => {
    process.env.SIGNUP_REQUIRE_EMAIL_CONFIRM = "true";
    expect(confirmWarning(launchStatus())).toBe(true);
  });

  it("stays silent by default (auto-confirm, no Supabase SMTP dependency)", () => {
    expect(confirmWarning(launchStatus())).toBe(false);
  });
});
