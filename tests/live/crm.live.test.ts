import { describe, it, expect } from "vitest";
import type { CrmProvider } from "@/lib/crm/types";
import { HubspotProvider } from "@/lib/crm/providers/hubspot";
import { PipedriveProvider } from "@/lib/crm/providers/pipedrive";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";
import { CloseProvider } from "@/lib/crm/providers/close";

/**
 * LIVE CRM smoke test — actually hits the real CRM APIs to prove an adapter
 * works end to end against a customer's account. It is OFF by default (so the
 * normal suite stays offline and fast); it runs only when you opt in:
 *
 *   CRM_LIVE_SMOKE=1 npm run smoke:crm
 *
 * with the relevant credentials exported (HUBSPOT_ACCESS_TOKEN,
 * PIPEDRIVE_API_TOKEN, SALESFORCE_ACCESS_TOKEN + SALESFORCE_INSTANCE_URL,
 * CLOSE_API_KEY). Only providers whose creds are present are exercised.
 *
 * Reads are always safe. Writes (create a throwaway contact/deal, log a note,
 * move a stage) run ONLY with CRM_SMOKE_WRITE=1, since they mutate the org.
 */

const LIVE = process.env.CRM_LIVE_SMOKE === "1";
const WRITE = process.env.CRM_SMOKE_WRITE === "1";
const T = { timeout: 60_000 };

const PROVIDERS: { name: string; ready: boolean; make: () => CrmProvider }[] = [
  { name: "HubSpot", ready: Boolean(process.env.HUBSPOT_ACCESS_TOKEN), make: () => new HubspotProvider() },
  { name: "Pipedrive", ready: Boolean(process.env.PIPEDRIVE_API_TOKEN), make: () => new PipedriveProvider() },
  { name: "Salesforce", ready: Boolean(process.env.SALESFORCE_ACCESS_TOKEN && process.env.SALESFORCE_INSTANCE_URL), make: () => new SalesforceProvider() },
  { name: "Close", ready: Boolean(process.env.CLOSE_API_KEY), make: () => new CloseProvider() },
];

if (LIVE && !PROVIDERS.some((p) => p.ready)) {
   
  console.warn("[crm.live] CRM_LIVE_SMOKE=1 but no provider credentials are set — nothing to smoke.");
}

for (const pv of PROVIDERS) {
  describe.skipIf(!LIVE || !pv.ready)(`live CRM: ${pv.name}`, () => {
    const p = pv.make();

    it("reports ready", () => {
      expect(p.info().ready).toBe(true);
    });

    it("reads users, pipelines, contacts, and deals", T, async () => {
      const [users, pipelines, contacts, opps] = await Promise.all([
        p.listUsers(),
        p.listPipelines(),
        p.listContacts(),
        p.listOpportunities(),
      ]);
      expect(Array.isArray(users)).toBe(true);
      expect(Array.isArray(pipelines)).toBe(true);
      expect(Array.isArray(contacts)).toBe(true);
      expect(Array.isArray(opps)).toBe(true);
      // Every pipeline must expose stages (the recall engine/board depend on it).
      for (const pl of pipelines) expect(pl.stages.length).toBeGreaterThan(0);
       
      console.log(`[${pv.name}] users=${users.length} pipelines=${pipelines.length} contacts=${contacts.length} deals=${opps.length}`);
    });

    it("reads activities for the first deal (if any)", T, async () => {
      const opps = await p.listOpportunities();
      if (opps.length === 0) return;
      const acts = await p.listActivities(opps[0].id);
      expect(Array.isArray(acts)).toBe(true);
       
      console.log(`[${pv.name}] activities on ${opps[0].id}: ${acts.length}`);
    });

    it.skipIf(!WRITE)("round-trips create contact → deal → log → move stage", T, async () => {
      const pipelines = await p.listPipelines();
      const pipeline = pipelines[0];
      const open = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];

      const contact = await p.createContact({ name: `RR Smoke ${Date.now()}`, company: "Revenue Recall Smoke", points: [{ channel: "email", value: `smoke+${Date.now()}@example.com` }] });
      expect(contact.id).toBeTruthy();

      const deal = await p.createOpportunity({ title: `RR Smoke Deal ${Date.now()}`, pipelineId: pipeline.id, stageId: open.id, value: 1234, currency: "USD", contactId: contact.id });
      expect(deal.id).toBeTruthy();

      const logged = await p.logActivity({ opportunityId: deal.id, contactId: contact.id, kind: "note", summary: "Revenue Recall live smoke note", occurredAt: new Date().toISOString() });
      expect(logged.id).toBeTruthy();

      const otherOpen = pipeline.stages.find((s) => s.type === "open" && s.id !== open.id);
      if (otherOpen) {
        const moved = await p.moveOpportunity(deal.id, otherOpen.id);
        expect(moved.id).toBe(deal.id);
      }
       
      console.log(`[${pv.name}] wrote contact=${contact.id} deal=${deal.id} note=${logged.id}`);
    });
  });
}

// Keep the file a valid (non-empty) suite even when fully skipped offline.
describe("live CRM smoke harness", () => {
  it.skipIf(LIVE)("is skipped unless CRM_LIVE_SMOKE=1 (this is expected offline)", () => {
    expect(LIVE).toBe(false);
  });
});
