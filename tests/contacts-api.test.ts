import { describe, it, expect, beforeEach, vi } from "vitest";

const { resolveOrgByApiKey } = vi.hoisted(() => ({ resolveOrgByApiKey: vi.fn() }));
vi.mock("@/lib/api-keys-server", () => ({ resolveOrgByApiKey }));

import { serializeContact } from "@/lib/contacts";
import { POST as createContact, GET as listContacts } from "@/app/api/v1/contacts/route";
import { GET as getContact, PATCH as patchContact } from "@/app/api/v1/contacts/[id]/route";
import { getProvider } from "@/lib/crm/registry";

const KEY = "Bearer rr_live_validlooooooooooong";

describe("serializeContact", () => {
  it("lifts email/phone out of points", () => {
    const out = serializeContact({ id: "c_1", name: "Jane", company: "Acme", points: [{ channel: "email", value: "j@a.com" }, { channel: "phone", value: "+1" }] } as never);
    expect(out).toMatchObject({ id: "c_1", name: "Jane", company: "Acme", email: "j@a.com", phone: "+1" });
  });
});

function jpost(body: unknown, auth = KEY) {
  return new Request("http://x/api/v1/contacts", { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body: JSON.stringify(body) });
}

describe("contacts API", () => {
  beforeEach(() => resolveOrgByApiKey.mockReset());

  it("POST rejects a missing key (401)", async () => {
    resolveOrgByApiKey.mockResolvedValue(null);
    const res = await createContact(jpost({ name: "Jane", email: "j@a.com" }, ""));
    expect(res.status).toBe(401);
  });

  it("POST 400s without email or phone", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const res = await createContact(jpost({ name: "Jane" }));
    expect(res.status).toBe(400);
  });

  it("POST creates a contact (201) and GET lists it", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const email = `c-${Date.now()}@acme.com`;
    const res = await createContact(jpost({ name: "API Contact", email, company: "Acme" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.contact.email).toBe(email);

    const listRes = await listContacts(new Request("http://x/api/v1/contacts?limit=200", { headers: { authorization: KEY } }));
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data.some((c: { email: string | null }) => c.email === email)).toBe(true);
  });

  it("de-dupes a repeat email — 200 + same contact, not a duplicate", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const email = `cdup-${Date.now()}@acme.com`;
    const r1 = await createContact(jpost({ name: "Dup", email }));
    expect(r1.status).toBe(201);
    const id1 = (await r1.json()).contact.id;
    const r2 = await createContact(jpost({ name: "Dup 2", email, company: "Acme" }));
    expect(r2.status).toBe(200); // matched the existing contact
    const j2 = await r2.json();
    expect(j2.deduped).toBe(true);
    expect(j2.contact.id).toBe(id1);
  });

  it("PATCH updates a contact and GET/PATCH 404 on unknown", async () => {
    resolveOrgByApiKey.mockResolvedValue("org_test");
    const created = await getProvider().createContact({ name: "Before", points: [{ channel: "email", value: `u-${Date.now()}@a.com` }] });

    const patchReq = new Request(`http://x/api/v1/contacts/${created.id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: KEY }, body: JSON.stringify({ company: "NewCo" }) });
    const patchRes = await patchContact(patchReq, { params: { id: created.id } });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).contact.company).toBe("NewCo");

    const missing = await getContact(new Request("http://x/api/v1/contacts/nope", { headers: { authorization: KEY } }), { params: { id: "nope" } });
    expect(missing.status).toBe(404);
  });
});
