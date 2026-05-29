import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";

interface Call { url: string; method: string; body: unknown; auth?: string }
let calls: Call[] = [];

/** Decode the SOQL out of a /query?q=... request. */
function soqlOf(url: string): string {
  return new URL(url).searchParams.get("q") ?? "";
}

function route(url: string, init?: RequestInit): { status?: number; body: unknown } {
  const method = (init?.method ?? "GET").toUpperCase();
  const u = new URL(url);
  const p = u.pathname;
  const soql = soqlOf(url);

  if (method === "GET" && p.endsWith("/query")) {
    if (soql.includes("FROM User")) return { body: { done: true, records: [{ Id: "005a", Name: "Sam Lee", Email: "sam@co.com" }] } };
    if (soql.includes("FROM OpportunityStage")) {
      return { body: { done: true, records: [
        { MasterLabel: "Prospecting", IsClosed: false, IsWon: false, DefaultProbability: 20, SortOrder: 1 },
        { MasterLabel: "Closed Won", IsClosed: true, IsWon: true, DefaultProbability: 100, SortOrder: 2 },
        { MasterLabel: "Closed Lost", IsClosed: true, IsWon: false, DefaultProbability: 0, SortOrder: 3 },
      ] } };
    }
    if (soql.includes("FROM Contact")) return { body: { done: true, records: [{ Id: "003a", Name: "Jane Roe", Email: "jane@x.com", Phone: "555", Account: { Name: "Acme" } }] } };
    if (soql.includes("FROM OpportunityContactRole")) return { body: { done: true, records: [{ OpportunityId: "006a", ContactId: "003a", IsPrimary: true }] } };
    if (soql.includes("FROM Opportunity")) return { body: { done: true, records: [{ Id: "006a", Name: "Big deal", Amount: 5000, StageName: "Prospecting", CloseDate: "2026-06-01", CreatedDate: "2026-01-01T00:00:00Z", LastModifiedDate: "2026-02-01T00:00:00Z", OwnerId: "005a" }] } };
    if (soql.includes("FROM Task")) return { body: { done: true, records: [{ Id: "00Ta", Subject: "Call", Description: "Talked", TaskSubtype: "Call", CreatedDate: "2026-02-03T00:00:00Z", WhatId: "006a", WhoId: "003a" }] } };
    return { body: { done: true, records: [] } };
  }
  if (method === "POST" && p.endsWith("/sobjects/Contact")) return { body: { id: "003b", success: true } };
  if (method === "POST" && p.endsWith("/sobjects/Opportunity")) return { body: { id: "006b", success: true } };
  if (method === "POST" && p.endsWith("/sobjects/OpportunityContactRole")) return { body: { id: "00Ka", success: true } };
  if (method === "POST" && p.endsWith("/sobjects/Task")) return { body: { id: "00Tb", success: true } };
  if (method === "PATCH" && p.includes("/sobjects/Opportunity/")) return { status: 204, body: null };
  return { status: 404, body: { message: `unrouted ${method} ${p}` } };
}

beforeEach(() => {
  calls = [];
  process.env.SALESFORCE_ACCESS_TOKEN = "sf-test";
  process.env.SALESFORCE_INSTANCE_URL = "https://acme.my.salesforce.com";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ url: String(url), method: (init?.method ?? "GET").toUpperCase(), body, auth });
    const r = route(String(url), init);
    return new Response(r.body == null ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SALESFORCE_ACCESS_TOKEN;
  delete process.env.SALESFORCE_INSTANCE_URL;
});

describe("SalesforceProvider (mocked API)", () => {
  it("hits the org instance URL with a Bearer token", async () => {
    await new SalesforceProvider().listUsers();
    expect(calls[0].url).toContain("acme.my.salesforce.com/services/data/v");
    expect(calls[0].auth).toBe("Bearer sf-test");
  });

  it("maps the OpportunityStage picklist to one pipeline with typed stages", async () => {
    const [pipe] = await new SalesforceProvider().listPipelines();
    expect(pipe.stages.map((s) => s.label)).toEqual(["Prospecting", "Closed Won", "Closed Lost"]);
    expect(pipe.stages.map((s) => s.type)).toEqual(["open", "won", "lost"]);
    expect(pipe.stages[0].probability).toBe(0.2);
    expect(pipe.stages[0].id).toBe("Prospecting"); // stage id == name
  });

  it("maps contacts with account company", async () => {
    const [c] = await new SalesforceProvider().listContacts();
    expect(c).toEqual({ id: "003a", name: "Jane Roe", company: "Acme", points: [{ channel: "email", value: "jane@x.com" }, { channel: "phone", value: "555" }] });
  });

  it("resolves a deal's primary contact via OpportunityContactRole", async () => {
    const [d] = await new SalesforceProvider().listOpportunities();
    expect(d.id).toBe("006a");
    expect(d.contactId).toBe("003a"); // from the role query
    expect(d.stageId).toBe("Prospecting");
    expect(d.value).toBe(5000);
  });

  it("createOpportunity defaults CloseDate and links a primary contact role", async () => {
    await new SalesforceProvider().createOpportunity({ title: "New", pipelineId: "salesforce", stageId: "Prospecting", value: 1000, currency: "USD", contactId: "003a" });
    const oppPost = calls.find((c) => c.method === "POST" && c.url.endsWith("/sobjects/Opportunity"))!;
    const body = oppPost.body as Record<string, string>;
    expect(body).toMatchObject({ Name: "New", StageName: "Prospecting", Amount: 1000 });
    expect(body.CloseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // defaulted
    const rolePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/sobjects/OpportunityContactRole"))!;
    expect(rolePost.body).toMatchObject({ OpportunityId: "006b", ContactId: "003a", IsPrimary: true });
  });

  it("moveOpportunity PATCHes StageName by name (204, then re-reads)", async () => {
    const d = await new SalesforceProvider().moveOpportunity("006a", "Closed Won");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect((patch.body as { StageName: string }).StageName).toBe("Closed Won");
    expect(d.id).toBe("006a");
  });

  it("logActivity creates a completed Task linked to the deal and contact", async () => {
    await new SalesforceProvider().logActivity({ kind: "call", summary: "Spoke with them", opportunityId: "006a", contactId: "003a", occurredAt: "2026-02-03T00:00:00Z" });
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/sobjects/Task"))!;
    expect(post.body).toMatchObject({ WhatId: "006a", WhoId: "003a", Status: "Completed" });
  });

  it("escapes single quotes in ids so a malicious id can't alter the SOQL", async () => {
    await new SalesforceProvider().getContact("x' OR Name!='");
    const q = calls.find((c) => soqlOf(c.url).includes("FROM Contact WHERE Id"))!;
    // The injected quote is backslash-escaped inside the literal, not closing it.
    expect(soqlOf(q.url)).toContain("Id = 'x\\' OR Name!=\\''");
  });
});
