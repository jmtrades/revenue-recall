import fs from "node:fs";
import path from "node:path";
import type {
  Activity,
  Contact,
  CrmProvider,
  Id,
  NewOpportunity,
  Opportunity,
  OpportunityFilter,
  Pipeline,
  ProviderInfo,
  User,
} from "@/lib/crm/types";
import { seedDataset, type Dataset } from "@/lib/data/seed";
import { getConfig } from "@/lib/config";

/**
 * Built-in CRM. Backs users who have no external CRM at all. Data lives in a
 * process-level singleton seeded from the active industry template, so the app
 * is fully functional out of the box. Swapping to a Supabase-backed store later
 * means re-implementing this same interface — nothing upstream changes.
 *
 * Optional disk persistence: set BUILTIN_PERSIST=true to write the store through
 * to a JSON file (BUILTIN_PERSIST_DIR, default ./.data) so demo edits survive
 * process restarts on local/self-hosted node deploys. Off by default — the store
 * is then purely in-memory and reseeds fresh each boot (the demo's default, and
 * what the test suite relies on). Production persistence is Supabase.
 */

const PERSIST = process.env.BUILTIN_PERSIST === "true";
const PERSIST_DIR = process.env.BUILTIN_PERSIST_DIR || path.join(process.cwd(), ".data");

let store: Dataset | null = null;
let storeIndustry: string | null = null;

function fileFor(industry: string): string {
  return path.join(PERSIST_DIR, `builtin-${industry}.json`);
}

function load(industry: string): Dataset | null {
  if (!PERSIST) return null;
  try {
    return JSON.parse(fs.readFileSync(fileFor(industry), "utf-8")) as Dataset;
  } catch {
    return null;
  }
}

function persist(): void {
  if (!PERSIST || !store || !storeIndustry) return;
  try {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    fs.writeFileSync(fileFor(storeIndustry), JSON.stringify(store));
  } catch {
    // best-effort: a read-only/ephemeral FS just falls back to in-memory.
  }
}

function db(): Dataset {
  const industry = getConfig().industryId;
  if (!store || storeIndustry !== industry) {
    store = load(industry) ?? seedDataset(industry);
    storeIndustry = industry;
  }
  return store;
}

function matches(o: Opportunity, f: OpportunityFilter | undefined, pipelines: Pipeline[]): boolean {
  if (!f) return true;
  if (f.pipelineId && o.pipelineId !== f.pipelineId) return false;
  if (f.ownerId && o.ownerId !== f.ownerId) return false;
  if (f.stageType) {
    const stage = pipelines.flatMap((p) => p.stages).find((s) => s.id === o.stageId);
    if (stage?.type !== f.stageType) return false;
  }
  if (f.staleSince && o.lastActivityAt && o.lastActivityAt > f.staleSince) return false;
  return true;
}

export class BuiltinProvider implements CrmProvider {
  info(): ProviderInfo {
    return {
      id: "builtin",
      label: "Built-in CRM",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: true,
    };
  }

  async listUsers(): Promise<User[]> {
    return db().users;
  }

  async listPipelines(): Promise<Pipeline[]> {
    return db().pipelines;
  }

  async listContacts(): Promise<Contact[]> {
    return db().contacts;
  }

  async getContact(id: Id): Promise<Contact | null> {
    return db().contacts.find((c) => c.id === id) ?? null;
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const contact: Contact = { ...input, id: `c_new_${Date.now()}` };
    db().contacts.unshift(contact);
    persist();
    return contact;
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const d = db();
    return d.opportunities.filter((o) => matches(o, filter, d.pipelines));
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    return db().opportunities.find((o) => o.id === id) ?? null;
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    const now = new Date().toISOString();
    const opp: Opportunity = {
      ...input,
      id: `o_new_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      tags: [],
    };
    db().opportunities.unshift(opp);
    persist();
    return opp;
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    const d = db();
    const opp = d.opportunities.find((o) => o.id === id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);
    const now = new Date().toISOString();
    opp.stageId = stageId;
    opp.updatedAt = now;
    const stage = d.pipelines.flatMap((p) => p.stages).find((s) => s.id === stageId);
    if (stage?.type === "won" || stage?.type === "lost") opp.closedAt = now;
    d.activities.push({
      id: `a_${id}_${Date.now()}`,
      opportunityId: id,
      contactId: opp.contactId,
      kind: "stage_change",
      summary: `Moved to ${stage?.label ?? stageId}`,
      occurredAt: now,
    });
    persist();
    return opp;
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    return db()
      .activities.filter((a) => a.opportunityId === opportunityId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    return db()
      .activities.slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, limit);
  }

  async listActivitiesByOpps(opportunityIds: Id[]): Promise<Record<Id, Activity[]>> {
    const want = new Set(opportunityIds);
    const out: Record<Id, Activity[]> = {};
    for (const id of opportunityIds) out[id] = [];
    for (const a of db().activities) {
      if (a.opportunityId && want.has(a.opportunityId)) out[a.opportunityId].push(a);
    }
    for (const id of opportunityIds) out[id].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    return out;
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    const d = db();
    const activity: Activity = { ...input, id: `a_${Date.now()}` };
    d.activities.push(activity);
    if (input.opportunityId) {
      const opp = d.opportunities.find((o) => o.id === input.opportunityId);
      if (opp) {
        opp.lastActivityAt = input.occurredAt;
        opp.updatedAt = input.occurredAt;
      }
    }
    persist();
    return activity;
  }
}
