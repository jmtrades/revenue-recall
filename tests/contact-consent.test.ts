import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { setContactConsent } from "@/lib/contacts";
import { hasCallConsent } from "@/lib/agent/guardrails";

// The consent toggle on the contact page is what unblocks autonomous dialing:
// the autopilot + call-retries only auto-dial when hasCallConsent() is true.
describe("setContactConsent", () => {
  it("records consent with provenance, then withdraws it", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Consenter", points: [{ channel: "phone", value: "+15550100999" }] });
    expect(hasCallConsent(c)).toBe(false); // no consent by default — never auto-dial

    const granted = await setContactConsent(c.id, true);
    expect(granted).toBeTruthy();
    expect(hasCallConsent(granted!)).toBe(true);
    expect(typeof granted!.attributes?.callConsentAt).toBe("string"); // dated marker on the record

    const revoked = await setContactConsent(c.id, false);
    expect(hasCallConsent(revoked!)).toBe(false); // withdrawal stops autonomous dialing
    expect(typeof revoked!.attributes?.callConsentRevokedAt).toBe("string");
  });

  it("preserves other attributes when toggling consent", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Has Attrs", points: [{ channel: "phone", value: "+15550100888" }], attributes: { budget: "50k" } });
    const granted = await setContactConsent(c.id, true);
    expect(granted!.attributes?.budget).toBe("50k"); // merge, never clobber
    expect(hasCallConsent(granted!)).toBe(true);
  });
});
