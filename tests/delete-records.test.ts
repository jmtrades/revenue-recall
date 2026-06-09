import { describe, it, expect } from "vitest";

import { DELETE as deleteDealRoute } from "@/app/api/opportunities/[id]/route";
import { DELETE as deleteContactRoute } from "@/app/api/contacts/[id]/route";
import { getProvider } from "@/lib/crm/registry";
import { createDealRecord } from "@/lib/deals";

function del(url: string) {
  return new Request(url, { method: "DELETE" });
}

describe("DELETE /api/opportunities/:id (delete deal)", () => {
  it("deletes a deal and cascades its activity, then 404s on re-delete", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Deal Owner", points: [{ channel: "email", value: `dd-${Date.now()}@a.com` }] });
    const created = await createDealRecord({ contactId: contact.id, title: "Junk dupe", value: 999 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const dealId = created.opp.id;
    await provider.logActivity({ opportunityId: dealId, contactId: contact.id, kind: "note", summary: "n", occurredAt: new Date().toISOString() });

    const res = await deleteDealRoute(del(`http://x/api/opportunities/${dealId}`), { params: { id: dealId } });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(await provider.getOpportunity(dealId)).toBeNull();
    expect(await provider.listActivities(dealId)).toHaveLength(0);

    const again = await deleteDealRoute(del(`http://x/api/opportunities/${dealId}`), { params: { id: dealId } });
    expect(again.status).toBe(404);
  });
});

describe("DELETE /api/contacts/:id (delete contact)", () => {
  it("deletes a contact with no deals", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "No Deals", points: [{ channel: "email", value: `nd-${Date.now()}@a.com` }] });
    const res = await deleteContactRoute(del(`http://x/api/contacts/${contact.id}`), { params: { id: contact.id } });
    expect(res.status).toBe(200);
    expect(await provider.getContact(contact.id)).toBeNull();
  });

  it("refuses to delete a contact that still has deals (409)", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Has Deals", points: [{ channel: "email", value: `hd-${Date.now()}@a.com` }] });
    const created = await createDealRecord({ contactId: contact.id, title: "Live deal", value: 500 });
    expect(created.ok).toBe(true);

    const res = await deleteContactRoute(del(`http://x/api/contacts/${contact.id}`), { params: { id: contact.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/deal/i);
    // The contact must survive a refused delete.
    expect(await provider.getContact(contact.id)).not.toBeNull();
  });

  it("404s for an unknown contact", async () => {
    const res = await deleteContactRoute(del("http://x/api/contacts/nope_missing"), { params: { id: "nope_missing" } });
    expect(res.status).toBe(404);
  });
});
