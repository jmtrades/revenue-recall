/**
 * One-click sample pipeline for a brand-new workspace — the fastest route to
 * the "aha": realistic contacts and deals, several already going cold, so the
 * Recall queue, dashboard, and reports light up immediately instead of asking
 * the user to imagine them.
 *
 * Guardrails:
 * - Built-in CRM only. If a real CRM is connected we refuse outright — demo
 *   records must never be written into someone's Salesforce/HubSpot.
 * - Org-scoped through the same provider every real record uses; every contact
 *   is tagged `attributes.sample`, and everything is editable/deletable like
 *   any record.
 * - No-ops (rather than duplicating) if the workspace already has contacts.
 */
import { resolveProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { seedDataset } from "@/lib/data/seed";
import { getSessionUser } from "@/lib/auth";
import { isAuthRequired } from "@/lib/config";
import type { Stage } from "@/lib/crm/types";

const TARGET = { stale: 5, active: 6, closed: 3 } as const;

// Demo sample data must NEVER land in a real customer's workspace. On a live
// (auth-on) deploy it's restricted to the operator's own account(s) — every
// other/new user gets a genuinely clean workspace and never even sees the
// "load sample data" option. Configurable via SAMPLE_DATA_EMAILS (comma list),
// falling back to OPERATOR_EMAIL, then the founder's address. With auth off
// (local/built-in demo) it stays available so the demo works.
const SAMPLE_DATA_DEFAULT_EMAIL = "jmtrades1990@gmail.com";

export function sampleDataAllowlist(): string[] {
  const raw = process.env.SAMPLE_DATA_EMAILS || process.env.OPERATOR_EMAIL || SAMPLE_DATA_DEFAULT_EMAIL;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** True only for accounts allowed to load demo sample data (operator only on a
 *  live deploy; anyone on the open/built-in demo). */
export async function canUseSampleData(): Promise<boolean> {
  if (!isAuthRequired()) return true; // open demo / built-in store
  const user = await getSessionUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  return !!email && sampleDataAllowlist().includes(email);
}

/** Map a seed stage onto the org's real pipeline by type + relative position,
 *  so customized pipelines (renamed/reordered stages) still get sane placement.
 *  Exported for tests. */
export function mapStage(seedStage: Stage | undefined, seedOpen: Stage[], orgStages: Stage[]): string {
  const orgOpen = orgStages.filter((s) => s.type === "open");
  const fallback = orgOpen[0] ?? orgStages[0];
  if (!seedStage) return fallback.id;
  if (seedStage.type === "won") return (orgStages.find((s) => s.type === "won") ?? fallback).id;
  if (seedStage.type === "lost") return (orgStages.find((s) => s.type === "lost") ?? fallback).id;
  const pos = Math.max(0, seedOpen.findIndex((s) => s.id === seedStage.id));
  const rel = seedOpen.length > 1 ? pos / (seedOpen.length - 1) : 0;
  return orgOpen.length > 0 ? orgOpen[Math.round(rel * (orgOpen.length - 1))].id : fallback.id;
}

export async function loadSampleData(): Promise<{ contacts: number; deals: number }> {
  // Hard gate: demo data is operator-only on a live deploy (never a real
  // customer's workspace). Defense-in-depth — the UI hides the button too.
  if (!(await canUseSampleData())) {
    throw new Error("Sample data isn't available on this account.");
  }
  const provider = await resolveProvider();
  // Allow both first-party stores — the built-in demo store AND the app's own
  // Supabase store (the live default). Only a customer's CONNECTED external CRM
  // (close/hubspot/salesforce/pipedrive) is off-limits, so we never write demo
  // rows into their real CRM. Without this, the "Explore with sample data" CTA —
  // the fastest path to value for a brand-new signup — fails on every live
  // (Supabase) workspace.
  if (!["builtin", "supabase"].includes(provider.info().id)) {
    throw new Error("Sample data is only for the built-in workspace — your connected CRM stays untouched.");
  }
  const existing = await provider.listContacts();
  if (existing.length > 0) return { contacts: 0, deals: 0 }; // already has data — never duplicate

  const org = await getOrgSettings();
  const dataset = seedDataset(org.industryId);
  const pipelines = await provider.listPipelines();
  const orgPipeline = pipelines[0];
  if (!orgPipeline) throw new Error("No pipeline found for this workspace.");
  const seedPipeline = dataset.pipelines[0];
  const seedOpen = seedPipeline.stages.filter((s) => s.type === "open");
  const stageById = new Map(seedPipeline.stages.map((s) => [s.id, s]));
  const users = await provider.listUsers().catch(() => []);

  // Pick a slice with a GUARANTEED mix (recall must have rows): stale-open
  // first, then fresh-open, then a few closed for the charts.
  const now = Date.now();
  const isStale = (iso?: string) => iso !== undefined && now - new Date(iso).getTime() > 21 * 86400000;
  const buckets = { stale: [] as string[], active: [] as string[], closed: [] as string[] };
  for (const o of dataset.opportunities) {
    const type = stageById.get(o.stageId)?.type ?? "open";
    const bucket = type !== "open" ? "closed" : isStale(o.lastActivityAt) ? "stale" : "active";
    if (buckets[bucket].length < TARGET[bucket]) buckets[bucket].push(o.id);
  }
  const chosenOpps = new Set([...buckets.stale, ...buckets.active, ...buckets.closed]);
  const opps = dataset.opportunities.filter((o) => chosenOpps.has(o.id));
  const chosenContacts = new Set(opps.map((o) => o.contactId));

  // Insert through the provider, remapping seed ids → real ids as we go.
  const contactIdMap = new Map<string, string>();
  for (const c of dataset.contacts) {
    if (!chosenContacts.has(c.id)) continue;
    const created = await provider.createContact({
      name: c.name,
      company: c.company,
      points: c.points,
      attributes: { ...(c.attributes ?? {}), sample: true },
    });
    contactIdMap.set(c.id, created.id);
  }

  const oppIdMap = new Map<string, string>();
  for (const o of opps) {
    const created = await provider.createOpportunity({
      title: o.title,
      pipelineId: orgPipeline.id,
      stageId: mapStage(stageById.get(o.stageId), seedOpen, orgPipeline.stages),
      value: o.value,
      currency: o.currency,
      contactId: contactIdMap.get(o.contactId)!,
      ownerId: users[0]?.id,
      source: o.source,
      expectedCloseAt: o.expectedCloseAt,
    });
    oppIdMap.set(o.id, created.id);
  }

  // Oldest-first so each deal's final lastActivityAt stamp is its most recent
  // touch — that recency is exactly what the recall engine scores.
  const acts = dataset.activities
    .filter((a) => a.opportunityId && oppIdMap.has(a.opportunityId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const a of acts) {
    await provider.logActivity({
      opportunityId: oppIdMap.get(a.opportunityId!),
      contactId: a.contactId ? contactIdMap.get(a.contactId) : undefined,
      kind: a.kind,
      summary: a.summary,
      occurredAt: a.occurredAt,
      direction: a.direction,
      ownerId: users[0]?.id,
    });
  }

  return { contacts: contactIdMap.size, deals: oppIdMap.size };
}
