import { describe, it, expect, vi } from "vitest";

// Emulate the DB-backed dedup store's real semantics (record-once; true on the
// second sighting) — the node test env has no Supabase, where the real helper
// deliberately fails open.
const seenKeys = new Set<string>();
vi.mock("@/lib/inbound-dedup", () => ({
  seenInboundEvent: async (provider: string, id: string) => {
    const key = `${provider}:${id}`;
    if (seenKeys.has(key)) return true;
    seenKeys.add(key);
    return false;
  },
  forgetInboundEvent: async () => {},
}));

import { sendWelcomeEmail, sendPaymentFailedEmail } from "@/lib/billing/lifecycle";

// No email transport in tests: sendEmail falls back to the "log" transport
// (status "logged" — counts as delivered); the owner lookup returns [] (no DB).
describe("lifecycle emails", () => {
  it("sends the welcome to an explicit recipient", async () => {
    const r = await sendWelcomeEmail("new-user@example.com", "Jordan Alvarez");
    expect(r.sent).toBe(true);
  });

  it("welcome requires a recipient", async () => {
    expect((await sendWelcomeEmail("")).reason).toBe("no_recipient");
  });

  it("dunning emails fail closed without a resolvable owner", async () => {
    expect((await sendPaymentFailedEmail("org_x", "evt_2")).reason).toBe("no_recipient");
  });

  it("dedupes on the Stripe event id so webhook retries can't double-send", async () => {
    await sendPaymentFailedEmail("org_y", "evt_dup");
    expect((await sendPaymentFailedEmail("org_y", "evt_dup")).reason).toBe("duplicate");
    // Different event id for the same org is NOT a duplicate.
    expect((await sendPaymentFailedEmail("org_y", "evt_other")).reason).toBe("no_recipient");
  });
});
