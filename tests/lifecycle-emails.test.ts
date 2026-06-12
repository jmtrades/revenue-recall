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

import { sendWelcomeEmail, sendPaymentFailedEmail, sendCancellationEmail, winbackBody } from "@/lib/billing/lifecycle";

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

describe("cancellation win-back", () => {
  it("leads with the org's own won-back number when the rep earned it", () => {
    const body = winbackBody({ wonBack: 3, recoveredValue: 47500, currency: "USD" });
    expect(body).toContain("won back $47,500 across 3 deals");
    expect(body).toContain("turns it back on");
    expect(body).toContain("reply and tell me");
  });

  it("stays graceful at zero — no empty brag, still leaves the door open", () => {
    for (const outcomes of [null, { wonBack: 0, recoveredValue: 0, currency: "USD" }]) {
      const body = winbackBody(outcomes);
      expect(body).not.toContain("won back");
      expect(body).toContain("turns it back on");
    }
  });

  it("dedupes on the event id and fails closed without a recipient", async () => {
    expect((await sendCancellationEmail("org_z", "evt_cancel_1")).reason).toBe("no_recipient");
    // The dedupe records first — a webhook retry of the same event is a duplicate
    // even though the first attempt found no recipient (matches dunning semantics).
    expect((await sendCancellationEmail("org_z", "evt_cancel_1")).reason).toBe("duplicate");
  });
});
