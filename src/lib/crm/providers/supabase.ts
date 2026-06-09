import type { SupabaseClient } from "@supabase/supabase-js";
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
  Stage,
  User,
} from "@/lib/crm/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import type {
  ActivityRow,
  ContactRow,
  MemberRow,
  OpportunityRow,
  PipelineRow,
  StageRow,
} from "@/lib/supabase/types";

/**
 * Supabase/Postgres-backed CRM. Implements the same CrmProvider interface as
 * the built-in store, so every screen and the recall engine work against a real
 * multi-tenant database the moment SUPABASE_* env vars are set. All queries are
 * explicitly org-scoped (defense in depth alongside RLS).
 */

// Most recent activities to keep per deal in the batch read. Enough to pick the
// reply channel and detect a recent opt-out; bounds memory on huge histories.
const ACTIVITIES_PER_OPP = 25;
export class SupabaseProvider implements CrmProvider {
  private client: SupabaseClient;
  private orgIdPromise?: Promise<string>;

  constructor() {
    const client = getSupabase();
    if (!client) throw new Error("Supabase is not configured");
    this.client = client;
  }

  private orgId(): Promise<string> {
    if (!this.orgIdPromise) {
      this.orgIdPromise = resolveActiveOrgId().then((id) => {
        if (!id) throw new Error("No org found — sign in or run the bootstrap to initialize the database.");
        return id;
      });
    }
    return this.orgIdPromise;
  }

  private async q<T>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await builder;
    if (error) throw new Error(error.message);
    return (data ?? []) as T;
  }

  info(): ProviderInfo {
    return {
      id: "supabase",
      label: "Built-in CRM (Supabase)",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: isSupabaseConfigured(),
    };
  }

  async listUsers(): Promise<User[]> {
    const orgId = await this.orgId();
    const rows = await this.q<MemberRow[]>(
      this.client.from("members").select("id,name,email").eq("org_id", orgId).order("created_at"),
    );
    return rows.map((m) => ({ id: m.id, name: m.name, email: m.email ?? undefined }));
  }

  async listPipelines(): Promise<Pipeline[]> {
    const orgId = await this.orgId();
    const pipes = await this.q<PipelineRow[]>(
      this.client.from("pipelines").select("id,label,position").eq("org_id", orgId).order("position"),
    );
    if (pipes.length === 0) return [];
    const stages = await this.q<StageRow[]>(
      this.client
        .from("stages")
        .select("id,pipeline_id,label,probability,type,position")
        .in("pipeline_id", pipes.map((p) => p.id))
        .order("position"),
    );
    return pipes.map((p) => ({
      id: p.id,
      label: p.label,
      stages: stages
        .filter((s) => s.pipeline_id === p.id)
        .map<Stage>((s) => ({ id: s.id, label: s.label, probability: Number(s.probability), type: s.type })),
    }));
  }

  async listContacts(): Promise<Contact[]> {
    const orgId = await this.orgId();
    const rows = await this.q<ContactRow[]>(
      this.client.from("contacts").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    );
    return rows.map(mapContact);
  }

  async getContact(id: Id): Promise<Contact | null> {
    const orgId = await this.orgId();
    const { data, error } = await this.client.from("contacts").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapContact(data as ContactRow) : null;
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const orgId = await this.orgId();
    const { data, error } = await this.client
      .from("contacts")
      .insert({
        org_id: orgId,
        name: input.name,
        company: input.company ?? null,
        title: input.title ?? null,
        points: input.points ?? [],
        attributes: input.attributes ?? {},
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapContact(data as ContactRow);
  }

  async updateContact(id: Id, patch: Partial<Omit<Contact, "id">>): Promise<Contact> {
    const orgId = await this.orgId();
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.company !== undefined) row.company = patch.company ?? null;
    if (patch.title !== undefined) row.title = patch.title ?? null;
    if (patch.points !== undefined) row.points = patch.points;
    if (patch.attributes !== undefined) row.attributes = patch.attributes;
    const { data, error } = await this.client
      .from("contacts")
      .update(row)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapContact(data as ContactRow);
  }

  async deleteContact(id: Id): Promise<void> {
    const orgId = await this.orgId();
    // activities.contact_id cascades; opportunities.contact_id is ON DELETE SET
    // NULL, so callers should only delete contacts with no deals to avoid
    // orphaning a pipeline record.
    const { error } = await this.client.from("contacts").delete().eq("org_id", orgId).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const orgId = await this.orgId();
    let query = this.client.from("opportunities").select("*").eq("org_id", orgId);
    if (filter?.pipelineId) query = query.eq("pipeline_id", filter.pipelineId);
    if (filter?.ownerId) query = query.eq("owner_id", filter.ownerId);
    if (filter?.staleSince) query = query.lte("last_activity_at", filter.staleSince);
    const rows = await this.q<OpportunityRow[]>(query.order("updated_at", { ascending: false }));
    let out = rows.map(mapOpportunity);
    if (filter?.stageType) {
      const stageType = new Map((await this.listPipelines()).flatMap((p) => p.stages).map((s) => [s.id, s.type]));
      out = out.filter((o) => stageType.get(o.stageId) === filter.stageType);
    }
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const orgId = await this.orgId();
    const { data, error } = await this.client.from("opportunities").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapOpportunity(data as OpportunityRow) : null;
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    const orgId = await this.orgId();
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("opportunities")
      .insert({
        org_id: orgId,
        pipeline_id: input.pipelineId,
        stage_id: input.stageId,
        contact_id: input.contactId,
        title: input.title,
        value: input.value,
        currency: input.currency,
        owner_id: input.ownerId ?? null,
        source: input.source ?? null,
        expected_close_at: input.expectedCloseAt ?? null,
        last_activity_at: now,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapOpportunity(data as OpportunityRow);
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    const orgId = await this.orgId();
    const stages = (await this.listPipelines()).flatMap((p) => p.stages);
    const stage = stages.find((s) => s.id === stageId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { stage_id: stageId, updated_at: now };
    if (stage?.type === "won" || stage?.type === "lost") patch.closed_at = now;
    const { data, error } = await this.client
      .from("opportunities")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const opp = mapOpportunity(data as OpportunityRow);
    await this.client.from("activities").insert({
      org_id: orgId,
      opportunity_id: id,
      contact_id: opp.contactId,
      kind: "stage_change",
      summary: `Moved to ${stage?.label ?? stageId}`,
      occurred_at: now,
    });
    return opp;
  }

  async deleteOpportunity(id: Id): Promise<void> {
    const orgId = await this.orgId();
    // activities.opportunity_id and agent_outbox.deal_id both ON DELETE CASCADE;
    // the text-keyed recall_events / snoozes / tasks become harmless orphans.
    const { error } = await this.client.from("opportunities").delete().eq("org_id", orgId).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    const orgId = await this.orgId();
    const rows = await this.q<ActivityRow[]>(
      this.client
        .from("activities")
        .select("*")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .order("occurred_at", { ascending: false }),
    );
    return rows.map(mapActivity);
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    const orgId = await this.orgId();
    const rows = await this.q<ActivityRow[]>(
      this.client.from("activities").select("*").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(limit),
    );
    return rows.map(mapActivity);
  }

  async listActivitiesByOpps(opportunityIds: Id[]): Promise<Record<Id, Activity[]>> {
    const out: Record<Id, Activity[]> = {};
    for (const id of opportunityIds) out[id] = [];
    if (opportunityIds.length === 0) return out;
    const orgId = await this.orgId();
    // Cap the rows pulled in one shot. Callers (cadence, agent) only need recent
    // history per deal to pick a reply channel and honor opt-outs — not the full
    // timeline — so without a ceiling a batch of long-history deals could drag
    // tens of thousands of rows into a single invocation. Newest-first + a cap
    // keeps it bounded while still giving each deal its latest activity.
    const cap = Math.min(5000, Math.max(200, opportunityIds.length * ACTIVITIES_PER_OPP));
    const rows = await this.q<ActivityRow[]>(
      this.client
        .from("activities")
        .select("*")
        .eq("org_id", orgId)
        .in("opportunity_id", opportunityIds)
        .order("occurred_at", { ascending: false })
        .limit(cap),
    );
    for (const row of rows) {
      const a = mapActivity(row);
      if (a.opportunityId && out[a.opportunityId] && out[a.opportunityId].length < ACTIVITIES_PER_OPP) {
        out[a.opportunityId].push(a);
      }
    }
    return out;
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    const orgId = await this.orgId();
    const { data, error } = await this.client
      .from("activities")
      .insert({
        org_id: orgId,
        opportunity_id: input.opportunityId ?? null,
        contact_id: input.contactId ?? null,
        kind: input.kind,
        summary: input.summary,
        direction: input.direction ?? null,
        owner_id: input.ownerId ?? null,
        occurred_at: input.occurredAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (input.opportunityId) {
      await this.client
        .from("opportunities")
        .update({ last_activity_at: input.occurredAt, updated_at: input.occurredAt })
        .eq("org_id", orgId)
        .eq("id", input.opportunityId);
    }
    return mapActivity(data as ActivityRow);
  }
}

function mapContact(r: ContactRow): Contact {
  return {
    id: r.id,
    name: r.name,
    company: r.company ?? undefined,
    title: r.title ?? undefined,
    points: (r.points ?? []).map((p) => ({ channel: p.channel as Contact["points"][number]["channel"], value: p.value, label: p.label })),
    attributes: r.attributes ?? {},
  };
}

function mapOpportunity(r: OpportunityRow): Opportunity {
  return {
    id: r.id,
    title: r.title,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    value: Number(r.value),
    currency: r.currency,
    contactId: r.contact_id ?? "",
    ownerId: r.owner_id ?? undefined,
    source: r.source ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastActivityAt: r.last_activity_at ?? undefined,
    expectedCloseAt: r.expected_close_at ?? undefined,
    closedAt: r.closed_at ?? undefined,
    lossReason: r.loss_reason ?? undefined,
    tags: r.tags ?? [],
  };
}

function mapActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    opportunityId: r.opportunity_id ?? undefined,
    contactId: r.contact_id ?? undefined,
    kind: r.kind as Activity["kind"],
    summary: r.summary,
    occurredAt: r.occurred_at,
    direction: r.direction ?? undefined,
    ownerId: r.owner_id ?? undefined,
  };
}
