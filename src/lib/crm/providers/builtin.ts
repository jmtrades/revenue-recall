import type {
  Activity,
  Contact,
  CrmProvider,
  Id,
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
 */

let store: Dataset | null = null;
let storeIndustry: string | null = null;

function db(): Dataset {
  const industry = getConfig().industryId;
  if (!store || storeIndustry !== industry) {
    store = seedDataset(industry);
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

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const d = db();
    return d.opportunities.filter((o) => matches(o, filter, d.pipelines));
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    return db().opportunities.find((o) => o.id === id) ?? null;
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
    return opp;
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    return db()
      .activities.filter((a) => a.opportunityId === opportunityId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
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
    return activity;
  }
}
