import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PipedriveProvider } from "@/lib/crm/providers/pipedrive";

interface Call { url: string; method: string; body: unknown }
let calls: Call[] = [];

function env<T>(data: T, extra?: object) {
  return { success: true, data, ...extra };
}

function route(url: string, init?: RequestInit): { status?: number; body: unknown } {
  const method = (init?.method ?? "GET").toUpperCase();
  const u = new URL(url);
  const p = u.pathname.replace(/\/v1/, "");

  if (method === "GET" && p === "/users") return { body: env([{ id: 9, name: "Sam Lee", email: "sam@co.com" }]) };
  if (method === "GET" && p === "/pipelines") return { body: env([{ id: 1, name: "Sales", order_nr: 0 }]) };
  if (method === "GET" && p === "/stages") {
    return { body: env([
      { id: 20, name: "Demo", pipeline_id: 1, order_nr: 2, deal_probability: 50 },
      { id: 10, name: "Lead In", pipeline_id: 1, order_nr: 1, deal_probability: 10 },
    ]) };
  }
  if (method === "GET" && p === "/persons") {
    return { body: env([{ id: 5, name: "Jane Roe", email: [{ value: "jane@x.com" }], phone: [{ value: "555" }], org_name: "Acme" }], { additional_data: { pagination: { more_items_in_collection: false } } }) };
  }
  if (method === "GET" && p === "/deals") {
    return { body: env([
      { id: 100, title: "Open deal", value: 5000, currency: "EUR", stage_id: 10, pipeline_id: 1, person_id: { value: 5 }, user_id: { value: 9 }, status: "open", add_time: "2026-01-01 10:00:00", update_time: "2026-02-01 10:00:00", last_activity_date: "2026-02-01" },
      { id: 101, title: "Won deal", value: 9000, currency: "USD", stage_id: 20, pipeline_id: 1, person_id: 7, status: "won", add_time: "2026-01-02 10:00:00", update_time: "2026-02-02 10:00:00", won_time: "2026-02-02 10:00:00" },
    ], { additional_data: { pagination: { more_items_in_collection: false } } }) };
  }
  if (method === "POST" && p === "/persons") return { body: env({ id: 6, name: "John Smith" }) };
  if (method === "POST" && p === "/deals") return { body: env({ id: 102, title: "New", value: 1000, currency: "USD", stage_id: 10, pipeline_id: 1, person_id: { value: 5 }, status: "open", add_time: "2026-03-01 10:00:00" }) };
  if (method === "PUT" && p === "/deals/100") {
    const b = init?.body ? JSON.parse(init.body as string) : {};
    return { body: env({ id: 100, title: "Open deal", value: 5000, currency: "EUR", stage_id: b.stage_id ?? 10, pipeline_id: 1, status: b.status ?? "open" }) };
  }
  if (method === "POST" && p === "/notes") return { body: env({ id: 200, add_time: "2026-03-02 10:00:00" }) };
  return { status: 404, body: env(null) };
}

beforeEach(() => {
  calls = [];
  process.env.PIPEDRIVE_API_TOKEN = "pd-test";
  delete process.env.PIPEDRIVE_API_BASE;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: (init?.method ?? "GET").toUpperCase(), body });
    const r = route(String(url), init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PIPEDRIVE_API_TOKEN;
});

describe("PipedriveProvider (mocked API)", () => {
  it("passes the api_token as a query param", async () => {
    await new PipedriveProvider().listUsers();
    expect(new URL(calls[0].url).searchParams.get("api_token")).toBe("pd-test");
  });

  it("maps users", async () => {
    expect(await new PipedriveProvider().listUsers()).toEqual([{ id: "9", name: "Sam Lee", email: "sam@co.com" }]);
  });

  it("builds a pipeline with ordered open stages + synthetic Won/Lost", async () => {
    const [pipe] = await new PipedriveProvider().listPipelines();
    expect(pipe.stages.map((s) => s.label)).toEqual(["Lead In", "Demo", "Won", "Lost"]);
    expect(pipe.stages.map((s) => s.type)).toEqual(["open", "open", "won", "lost"]);
    expect(pipe.stages[0].probability).toBe(0.1);
  });

  it("maps persons (object email/phone arrays, org name)", async () => {
    const [c] = await new PipedriveProvider().listContacts();
    expect(c).toEqual({ id: "5", name: "Jane Roe", company: "Acme", points: [{ channel: "email", value: "jane@x.com" }, { channel: "phone", value: "555" }] });
  });

  it("maps deals, routing a won deal to the synthetic Won stage and normalizing time", async () => {
    const deals = await new PipedriveProvider().listOpportunities();
    const open = deals.find((d) => d.id === "100")!;
    const won = deals.find((d) => d.id === "101")!;
    expect(open.stageId).toBe("10");
    expect(open.value).toBe(5000);
    expect(open.contactId).toBe("5");
    expect(open.ownerId).toBe("9");
    expect(open.updatedAt).toBe("2026-02-01T10:00:00Z"); // space→T, +Z
    expect(won.stageId).toBe("1:won"); // status won → synthetic stage
    expect(won.contactId).toBe("7"); // bare-number person_id
  });

  it("createOpportunity sends numeric ids and a real stage_id", async () => {
    await new PipedriveProvider().createOpportunity({ title: "New", pipelineId: "1", stageId: "10", value: 1000, currency: "USD", contactId: "5" });
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/deals"))!;
    expect(post.body).toMatchObject({ title: "New", value: 1000, currency: "USD", pipeline_id: 1, person_id: 5, stage_id: 10 });
  });

  it("createOpportunity omits a synthetic (non-numeric) stage id", async () => {
    await new PipedriveProvider().createOpportunity({ title: "X", pipelineId: "1", stageId: "1:won", value: 1, currency: "USD", contactId: "5" });
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/deals"))!;
    expect((post.body as Record<string, unknown>).stage_id).toBeUndefined();
  });

  it("moveOpportunity to a synthetic Won stage sets status=won", async () => {
    await new PipedriveProvider().moveOpportunity("100", "1:won");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ status: "won" });
  });

  it("moveOpportunity to a real stage reopens the deal", async () => {
    await new PipedriveProvider().moveOpportunity("100", "20");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ stage_id: 20, status: "open" });
  });

  it("logActivity posts a note linked to the deal and person", async () => {
    await new PipedriveProvider().logActivity({ kind: "note", summary: "spoke", opportunityId: "100", contactId: "5", occurredAt: "2026-03-02T00:00:00Z" });
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/notes"))!;
    expect(post.body).toMatchObject({ content: "spoke", deal_id: 100, person_id: 5 });
  });
});
