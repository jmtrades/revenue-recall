import { describe, it, expect } from "vitest";
import { createDealRecord } from "@/lib/deals";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";

describe("one currency per workspace", () => {
  it("a new deal uses the org currency and ignores a client-supplied one", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Currency Test", points: [{ channel: "email", value: `cur${Date.now()}@x.com` }] });
    const res = await createDealRecord({ contactId: contact.id, title: "Foreign deal", value: 1000, currency: "EUR" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const orgCurrency = (await getOrgSettings()).currency;
      expect(res.opp.currency).toBe(orgCurrency); // org currency wins
      expect(res.opp.currency).not.toBe("EUR"); // the client value is ignored
    }
  });
});
