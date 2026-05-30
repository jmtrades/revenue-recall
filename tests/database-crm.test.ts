import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseProvider, databaseConfigured, extractRows, normalizeStageId } from "@/lib/crm/providers/database";

const realFetch = global.fetch;

function mockRows(payload: unknown) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }) as Response) as unknown as typeof fetch;
}

beforeEach(() => {
  delete process.env.DATA_SOURCE_URL;
  delete process.env.DATA_SOURCE_TOKEN;
  delete process.env.DATA_SOURCE_MAPPING;
});
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("generic database adapter — connect any table, even non-CRM", () => {
  it("is inert until DATA_SOURCE_URL is set", () => {
    expect(databaseConfigured()).toBe(false);
    expect(new DatabaseProvider().info().ready).toBe(false);
    expect(new DatabaseProvider().info().id).toBe("database");
  });

  it("becomes ready once DATA_SOURCE_URL is set", () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    expect(databaseConfigured()).toBe(true);
    const info = new DatabaseProvider().info();
    expect(info.ready).toBe(true);
    expect(info.capabilities.write).toBe(true);
  });

  it("maps an arbitrary leads table (auto-detected columns) onto the universal model", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    mockRows([
      { full_name: "Ada Lovelace", email_address: "ada@analytical.io", company_name: "Analytical", deal_size: "$12,500", status: "qualified" },
      { full_name: "Grace Hopper", mobile: "+15551234567", account: "Navy", revenue: 90000, deal_stage: "Closed Won" },
    ]);
    const p = new DatabaseProvider();

    const contacts = await p.listContacts();
    expect(contacts).toHaveLength(2);
    const ada = contacts.find((c) => c.name === "Ada Lovelace")!;
    expect(ada.company).toBe("Analytical");
    expect(ada.points.find((pt) => pt.channel === "email")?.value).toBe("ada@analytical.io");
    const grace = contacts.find((c) => c.name === "Grace Hopper")!;
    expect(grace.points.find((pt) => pt.channel === "phone")?.value).toBe("+15551234567");

    const opps = await p.listOpportunities();
    expect(opps).toHaveLength(2);
    const adaOpp = opps.find((o) => o.contactId === ada.id)!;
    expect(adaOpp.value).toBe(12500);
    expect(adaOpp.stageId).toBe("db_qualified");
    expect(adaOpp.pipelineId).toBe("db_pipeline");
    expect(opps.find((o) => o.contactId === grace.id)!.stageId).toBe("db_won");
  });

  it("honours an explicit DATA_SOURCE_MAPPING over alias auto-detection", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    process.env.DATA_SOURCE_MAPPING = JSON.stringify({ name: "contact", value: "size", stage: "phase" });
    mockRows([{ contact: "Bob", size: 999, phase: "negotiation", name: "ignored-decoy" }]);
    const p = new DatabaseProvider();

    const contacts = await p.listContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Bob");
    const opps = await p.listOpportunities();
    expect(opps[0].value).toBe(999);
    expect(opps[0].stageId).toBe("db_negotiation");
  });

  it("skips rows with no name/email/phone", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    mockRows([{ notes: "no identity here" }, { name: "Real Lead" }]);
    const p = new DatabaseProvider();
    const contacts = await p.listContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Real Lead");
  });

  it("seeds no demo data — an empty source yields an empty workspace", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    mockRows([]);
    const p = new DatabaseProvider();
    expect(await p.listContacts()).toHaveLength(0);
    expect(await p.listOpportunities()).toHaveLength(0);
    expect(await p.listRecentActivities(10)).toHaveLength(0);
  });

  it("merges agent writes (new contacts, logged calls) with external reads", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    mockRows([{ name: "External Lead", email: "ext@x.io" }]);
    const p = new DatabaseProvider();

    const created = await p.createContact({ name: "Agent Lead", points: [] });
    await p.logActivity({ contactId: created.id, kind: "call", summary: "Dialed", occurredAt: new Date().toISOString() });

    const contacts = await p.listContacts();
    expect(contacts.some((c) => c.name === "External Lead")).toBe(true);
    expect(contacts.some((c) => c.id === created.id)).toBe(true);

    const acts = await p.listActivitiesByContact(created.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].summary).toBe("Dialed");
  });

  it("moves an external opportunity through stages via the local override layer", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    mockRows([{ name: "Mover", email: "m@x.io", amount: 5000, status: "lead" }]);
    const p = new DatabaseProvider();

    const before = (await p.listOpportunities())[0];
    expect(before.stageId).toBe("db_lead");

    const moved = await p.moveOpportunity(before.id, "db_won");
    expect(moved.stageId).toBe("db_won");
    expect(moved.closedAt).toBeTruthy();

    // Re-read reflects the override, not a duplicate row.
    const after = await p.listOpportunities();
    expect(after).toHaveLength(1);
    expect(after[0].stageId).toBe("db_won");

    const won = await p.listOpportunities({ stageType: "won" });
    expect(won).toHaveLength(1);
  });

  it("falls back to an empty workspace when the source errors (never hard-fails)", async () => {
    process.env.DATA_SOURCE_URL = "https://db.example/leads";
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const p = new DatabaseProvider();
    expect(await p.listContacts()).toEqual([]);
    expect(await p.listOpportunities()).toEqual([]);
  });
});

describe("database adapter helpers", () => {
  it("extractRows unwraps common envelopes incl. Airtable", () => {
    expect(extractRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(extractRows({ rows: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    const air = extractRows({ records: [{ id: "rec1", fields: { Name: "Z" } }] });
    expect(air).toHaveLength(1);
    expect((air[0] as Record<string, unknown>).Name).toBe("Z");
    expect((air[0] as Record<string, unknown>).id).toBe("rec1");
    expect(extractRows(null)).toEqual([]);
  });

  it("normalizeStageId maps real-world status strings to pipeline stages", () => {
    expect(normalizeStageId("Closed Won")).toBe("db_won");
    expect(normalizeStageId("closed_lost")).toBe("db_lost");
    expect(normalizeStageId("new")).toBe("db_lead");
    expect(normalizeStageId("MQL")).toBe("db_qualified");
    expect(normalizeStageId("anything-unknown")).toBe("db_lead");
  });
});
