import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { markEmailBounced, isEmailBounced } from "@/lib/bounce";
import { addressFor } from "@/lib/cadence";

describe("email bounce suppression", () => {
  it("flags a hard-bounced address and makes the email channel unreachable", async () => {
    const provider = getProvider();
    const email = "dead.address@example.com";
    const contact = await provider.createContact({
      name: "Bouncey McBounce",
      points: [
        { channel: "email", value: email },
        { channel: "phone", value: "+15557654321" },
      ],
    });

    // Before: email is reachable.
    let fresh = (await provider.getContact(contact.id))!;
    expect(isEmailBounced(fresh)).toBe(false);
    expect(addressFor(fresh, "email")).toBe(email);

    const flagged = await markEmailBounced(email);
    expect(flagged).toBe(1);

    // After: email is suppressed, but phone still works (SMS/call unaffected).
    fresh = (await provider.getContact(contact.id))!;
    expect(isEmailBounced(fresh)).toBe(true);
    expect(addressFor(fresh, "email")).toBeUndefined();
    expect(addressFor(fresh, "sms")).toBe("+15557654321");
    expect(addressFor(fresh, "call")).toBe("+15557654321");
  });

  it("is idempotent and a no-op for unknown addresses", async () => {
    expect(await markEmailBounced("nobody-here@example.com")).toBe(0);
    const provider = getProvider();
    const email = "twice@example.com";
    await provider.createContact({ name: "Twice", points: [{ channel: "email", value: email }] });
    expect(await markEmailBounced(email)).toBe(1);
    expect(await markEmailBounced(email)).toBe(1); // still 1, already suppressed
  });
});
