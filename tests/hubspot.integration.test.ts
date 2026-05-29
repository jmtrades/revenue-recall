import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HubspotProvider } from "@/lib/crm/providers/hubspot";

/**
 * Integration tests with a mocked fetch: they drive the adapter through
 * realistic HubSpot API payloads and assert BOTH the requests it sends and the
 * universal shape it maps responses into. This verifies endpoints, request
 * bodies, and field mapping without needing a live HubSpot account.
 */

interface Call { url: string; method: string; body: unknown; auth?: string }
let calls: Call[] = [];

function route(url: string, init?: RequestInit): { status?: number; body: unknown } {
  const method = (init?.method ?? "GET").toUpperCase();
  const u = new URL(url);
  const p = u.pathname;

  if (method === "GET" && p === "/crm/v3/owners/") {
    return { body: { results: [{ id: "u1", firstName: "Sam", lastName: "Lee", email: "sam@co.com" }] } };
  }
  if (method === "GET" && p === "/crm/v3/pipelines/deals") {
    return {
      body: {
        results: [
          {
            id: "p1",
            label: "Sales",
            displayOrder: 0,
            stages: [
              { id: "s2", label: "Won", displayOrder: 1, metadata: { isClosed: "true", probability: "1.0" } },
              { id: "s1", label: "New", displayOrder: 0, metadata: { isClosed: "false", probability: "0.2" } },
            ],
          },
        ],
      },
    };
  }
  if (method === "GET" && p === "/crm/v3/objects/contacts") {
    return { body: { results: [{ id: "c1", properties: { firstname: "Jane", lastname: "Roe", email: "jane@x.com", phone: "555-0100", company: "Acme" } }] } };
  }
  if (method === "GET" && p === "/crm/v3/objects/deals") {
    return {
      body: {
        results: [
          {
            id: "d1",
            properties: { dealname: "Big deal", amount: "5000", dealstage: "s1", pipeline: "p1", createdate: "2026-01-01T00:00:00Z", hs_lastmodifieddate: "2026-02-01T00:00:00Z", deal_currency_code: "EUR" },
            associations: { contacts: { results: [{ id: "c1" }] } },
          },
        ],
      },
    };
  }
  if (method === "POST" && p === "/crm/v3/objects/contacts") {
    return { body: { id: "c2", properties: { firstname: "John", lastname: "Smith" } } };
  }
  if (method === "POST" && p === "/crm/v3/objects/deals") {
    return { body: { id: "d2", properties: { dealname: "New deal", amount: "1000", dealstage: "s1", pipeline: "p1", deal_currency_code: "USD" } } };
  }
  if (method === "PATCH" && p === "/crm/v3/objects/deals/d1") {
    return { body: { id: "d1", properties: { dealname: "Big deal", amount: "5000", dealstage: "s2", pipeline: "p1" } } };
  }
  if (method === "POST" && p === "/crm/v3/objects/notes") {
    return { body: { id: "n1", properties: { hs_timestamp: "2026-02-02T00:00:00Z" } } };
  }
  return { status: 404, body: { message: `unrouted ${method} ${p}` } };
}

beforeEach(() => {
  calls = [];
  process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ url: String(url), method: (init?.method ?? "GET").toUpperCase(), body, auth });
    const r = route(String(url), init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HUBSPOT_ACCESS_TOKEN;
});

describe("HubspotProvider (mocked API)", () => {
  it("sends a Bearer token to the HubSpot API", async () => {
    await new HubspotProvider().listUsers();
    expect(calls[0].url).toContain("api.hubapi.com");
    expect(calls[0].auth).toBe("Bearer pat-test");
  });

  it("maps owners to users", async () => {
    const users = await new HubspotProvider().listUsers();
    expect(users).toEqual([{ id: "u1", name: "Sam Lee", email: "sam@co.com" }]);
  });

  it("maps pipelines, sorts stages by displayOrder, and types won/open", async () => {
    const [pipe] = await new HubspotProvider().listPipelines();
    expect(pipe.id).toBe("p1");
    expect(pipe.stages.map((s) => s.label)).toEqual(["New", "Won"]); // sorted
    expect(pipe.stages.map((s) => s.type)).toEqual(["open", "won"]);
    expect(pipe.stages[0].probability).toBe(0.2);
  });

  it("maps contacts (name, points, company)", async () => {
    const [c] = await new HubspotProvider().listContacts();
    expect(c).toEqual({ id: "c1", name: "Jane Roe", company: "Acme", points: [{ channel: "email", value: "jane@x.com" }, { channel: "phone", value: "555-0100" }] });
  });

  it("maps deals incl. amount, currency, associated contact, and recall signal", async () => {
    const [d] = await new HubspotProvider().listOpportunities();
    expect(d.value).toBe(5000);
    expect(d.currency).toBe("EUR");
    expect(d.contactId).toBe("c1");
    expect(d.stageId).toBe("s1");
    expect(d.lastActivityAt).toBe("2026-02-01T00:00:00Z");
  });

  it("createContact splits the name and sends email/phone properties", async () => {
    const c = await new HubspotProvider().createContact({ name: "John Smith", company: "Beta", points: [{ channel: "email", value: "j@b.com" }, { channel: "phone", value: "555" }] });
    const post = calls.find((x) => x.method === "POST" && x.url.includes("/objects/contacts"))!;
    expect((post.body as { properties: Record<string, string> }).properties).toMatchObject({ firstname: "John", lastname: "Smith", email: "j@b.com", phone: "555", company: "Beta" });
    expect(c.id).toBe("c2");
  });

  it("createOpportunity sends deal properties and associates the contact", async () => {
    const d = await new HubspotProvider().createOpportunity({ title: "New deal", pipelineId: "p1", stageId: "s1", value: 1000, currency: "USD", contactId: "c1" });
    const post = calls.find((x) => x.method === "POST" && x.url.includes("/objects/deals"))!;
    const body = post.body as { properties: Record<string, string>; associations: { to: { id: string }; types: { associationTypeId: number }[] }[] };
    expect(body.properties).toMatchObject({ dealname: "New deal", amount: "1000", dealstage: "s1", pipeline: "p1" });
    expect(body.associations[0].to.id).toBe("c1");
    expect(body.associations[0].types[0].associationTypeId).toBe(3);
    expect(d.value).toBe(1000);
    expect(d.contactId).toBe("c1");
  });

  it("moveOpportunity PATCHes the dealstage", async () => {
    const d = await new HubspotProvider().moveOpportunity("d1", "s2");
    const patch = calls.find((x) => x.method === "PATCH")!;
    expect((patch.body as { properties: { dealstage: string } }).properties.dealstage).toBe("s2");
    expect(d.stageId).toBe("s2");
  });

  it("logActivity posts a note associated to the deal (214) and contact (202)", async () => {
    await new HubspotProvider().logActivity({ kind: "note", summary: "Called them", opportunityId: "d1", contactId: "c1", occurredAt: "2026-02-02T00:00:00Z" });
    const post = calls.find((x) => x.method === "POST" && x.url.includes("/objects/notes"))!;
    const body = post.body as { properties: Record<string, string>; associations: { to: { id: string }; types: { associationTypeId: number }[] }[] };
    expect(body.properties.hs_note_body).toBe("Called them");
    const typeIds = body.associations.flatMap((a) => a.types.map((t) => t.associationTypeId));
    expect(typeIds).toContain(214);
    expect(typeIds).toContain(202);
  });
});
