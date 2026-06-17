import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { setContactConsent } from "@/lib/contacts";
import { hasCallConsent, hasSmsConsent } from "@/lib/agent/guardrails";

// The consent toggle on the contact page is what unblocks autonomous outreach:
// the autopilot + call-retries only auto-call/text when consent is on file.
describe("setContactConsent", () => {
  it("records combined call + text consent with provenance, then withdraws both", async () => {
    const p = getProvider();
    const c = await p.createContact({ name: "Consenter", points: [{ channel: "phone", value: "+15550100999" }] });
    expect(hasCallConsent(c)).toBe(false); // no consent by default — never auto-contact
    expect(hasSmsConsent(c)).toBe(false);

    const granted = await setContactConsent(c.id, true);
    expect(granted).toBeTruthy();
    expect(hasCallConsent(granted!)).toBe(true);
    expect(hasSmsConsent(granted!)).toBe(true); // one action grants both channels
    expect(typeof granted!.attributes?.callConsentAt).toBe("string"); // dated marker on the record

    const revoked = await setContactConsent(c.id, false);
    expect(hasCallConsent(revoked!)).toBe(false); // withdrawal stops autonomous calling
    expect(hasSmsConsent(revoked!)).toBe(false); // ...and texting
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
