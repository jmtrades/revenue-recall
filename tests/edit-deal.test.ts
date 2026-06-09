import { describe, it, expect } from "vitest";

import { PATCH as editDealRoute } from "@/app/api/opportunities/[id]/route";
import { getProvider } from "@/lib/crm/registry";
import { createDealRecord } from "@/lib/deals";

function patch(id: string, body: unknown) {
  return editDealRoute(
    new Request(`http://x/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

async function makeDeal() {
  const provider = getProvider();
  const contact = await provider.createContact({ name: "Edit Target", points: [{ channel: "email", value: `ed-${Date.now()}-${Math.random()}@a.com` }] });
  const created = await createDealRecord({ contactId: contact.id, title: "Original", value: 100 });
  if (!created.ok) throw new Error("setup failed");
  return created.opp.id;
}

describe("PATCH /api/opportunities/:id (edit deal)", () => {
  it("updates title and value", async () => {
    const id = await makeDeal();
    const res = await patch(id, { title: "Corrected name", value: 4200 });
    expect(res.status).toBe(200);
    const opp = await getProvider().getOpportunity(id);
    expect(opp?.title).toBe("Corrected name");
    expect(opp?.value).toBe(4200);
  });

  it("sets the expected close date as an ISO string", async () => {
    const id = await makeDeal();
    const res = await patch(id, { expectedCloseAt: "2026-09-01" });
    expect(res.status).toBe(200);
    const opp = await getProvider().getOpportunity(id);
    expect(opp?.expectedCloseAt).toMatch(/^2026-09-01T/);
  });

  it("400s when no field is provided", async () => {
    const id = await makeDeal();
    expect((await patch(id, {})).status).toBe(400);
  });

  it("400s on a negative value", async () => {
    const id = await makeDeal();
    expect((await patch(id, { value: -5 })).status).toBe(400);
  });

  it("400s on an unparseable close date", async () => {
    const id = await makeDeal();
    expect((await patch(id, { expectedCloseAt: "not-a-date" })).status).toBe(400);
  });

  it("404s for an unknown deal", async () => {
    expect((await patch("nope_missing", { value: 1 })).status).toBe(404);
  });
});
