import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseProvider, extractRows, normalizeStage } from "@/lib/crm/providers/database";

type Json = unknown;
function mockFetch(payload: Json) {
  globalThis.fetch = (async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch;
}

// The fetch/env-dependent cases share process.env + globalThis.fetch, so they
// run as one sequential test — no sibling can swap the mock mid-await. The pure
// helper tests below touch no globals and are safe to run concurrently.
test("DatabaseProvider: maps arbitrary tables, honours explicit mapping, merges local writes", async () => {
  process.env.DATA_SOURCE_URL = "https://db.example/leads";

  // 1) Auto-detected columns on a table that is not a normal CRM.
  delete process.env.DATA_SOURCE_MAPPING;
  mockFetch([
    { full_name: "Ada Lovelace", email_address: "ada@analytical.io", company_name: "Analytical", deal_size: "$12,500", status: "qualified" },
    { full_name: "Grace Hopper", mobile: "+15551234567", account: "Navy", revenue: 90000, deal_stage: "Closed Won" },
  ]);
  let p = new DatabaseProvider();
  const contacts = await p.listContacts();
  assert.equal(contacts.length, 2);
  const ada = contacts.find((c) => c.name === "Ada Lovelace")!;
  assert.equal(ada.company, "Analytical");
  assert.equal(ada.points.find((pt) => pt.channel === "email")?.value, "ada@analytical.io");
  const grace = contacts.find((c) => c.name === "Grace Hopper")!;
  assert.equal(grace.points.find((pt) => pt.channel === "phone")?.value, "+15551234567");
  const opps = await p.listOpportunities();
  assert.equal(opps.length, 2);
  assert.equal(opps.find((o) => o.contactId === ada.id)!.value, 12500);
  assert.equal(opps.find((o) => o.contactId === ada.id)!.stage, "qualified");
  assert.equal(opps.find((o) => o.contactId === grace.id)!.stage, "won");

  // 2) Explicit DATA_SOURCE_MAPPING wins over alias auto-detection.
  process.env.DATA_SOURCE_MAPPING = JSON.stringify({ name: "contact", value: "size", stage: "phase" });
  mockFetch([{ contact: "Bob", size: 999, phase: "negotiation", name: "ignored-decoy" }]);
  p = new DatabaseProvider();
  const mapped = await p.listContacts();
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].name, "Bob");
  const mappedOpps = await p.listOpportunities();
  assert.equal(mappedOpps[0].value, 999);
  assert.equal(mappedOpps[0].stage, "negotiation");

  // 3) Rows with no name/email/phone are skipped.
  delete process.env.DATA_SOURCE_MAPPING;
  mockFetch([{ notes: "no identity here" }, { name: "Real Lead" }]);
  p = new DatabaseProvider();
  const filtered = await p.listContacts();
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, "Real Lead");

  // 4) Agent writes are held locally and merged into external reads.
  mockFetch([{ name: "External Lead", email: "ext@x.io" }]);
  p = new DatabaseProvider();
  const created = await p.createContact({ name: "Agent Lead", points: [] });
  await p.logActivity({ contactId: created.id, kind: "call", summary: "Dialed", occurredAt: new Date().toISOString() });
  const merged = await p.listContacts();
  assert.ok(merged.some((c) => c.name === "External Lead"));
  assert.ok(merged.some((c) => c.id === created.id));
  const acts = await p.listActivitiesByContact(created.id);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].summary, "Dialed");
});

test("extractRows unwraps common envelopes incl. Airtable", () => {
  assert.deepEqual(extractRows([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(extractRows({ rows: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(extractRows({ data: [{ a: 1 }] }), [{ a: 1 }]);
  const air = extractRows({ records: [{ id: "rec1", fields: { Name: "Z" } }] });
  assert.equal(air.length, 1);
  assert.equal((air[0] as Record<string, unknown>).Name, "Z");
  assert.equal((air[0] as Record<string, unknown>).id, "rec1");
  assert.deepEqual(extractRows(null), []);
});

test("normalizeStage maps real-world status strings", () => {
  assert.equal(normalizeStage("Closed Won"), "won");
  assert.equal(normalizeStage("closed_lost"), "lost");
  assert.equal(normalizeStage("new"), "lead");
  assert.equal(normalizeStage("MQL"), "qualified");
  assert.equal(normalizeStage("anything-unknown"), "lead");
});
