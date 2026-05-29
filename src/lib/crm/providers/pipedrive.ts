import type {
  Activity,
  ActivityKind,
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

/**
 * Pipedrive CRM adapter (https://developers.pipedrive.com/docs/api/v1). Reads an
 * API token from PIPEDRIVE_API_TOKEN (optionally a company base URL from
 * PIPEDRIVE_API_BASE) and maps Pipedrive's persons / deals / pipelines /
 * stages / users / activities onto the universal model.
 *
 * Pipedrive models won/lost as a deal *status*, not a pipeline stage, so we
 * append synthetic "Won"/"Lost" stages to each pipeline and route closed deals
 * to them — letting the recall engine and board reason about outcomes uniformly.
 */

const DEFAULT_BASE = "https://api.pipedrive.com/v1";

interface PdEnvelope<T> {
  success: boolean;
  data: T;
  additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } };
}
interface PdStage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr?: number;
  deal_probability?: number | null;
}
interface PdDeal {
  id: number;
  title: string;
  value?: number;
  currency?: string;
  stage_id?: number;
  pipeline_id?: number;
  person_id?: { value?: number; name?: string } | number | null;
  user_id?: { value?: number } | number | null;
  add_time?: string;
  update_time?: string;
  status?: string;
  won_time?: string | null;
  lost_time?: string | null;
  lost_reason?: string | null;
  expected_close_date?: string | null;
  last_activity_date?: string | null;
}
interface PdPerson {
  id: number;
  name: string;
  email?: ({ value?: string } | string)[] | null;
  phone?: ({ value?: string } | string)[] | null;
  org_name?: string | null;
  org_id?: { name?: string } | null;
}

const WON = "won";
const LOST = "lost";

/** Pipedrive timestamps are "YYYY-MM-DD HH:MM:SS" in UTC — normalize to ISO. */
export function pdTime(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("T")) return raw; // already ISO
  const iso = raw.replace(" ", "T");
  return /\d{2}:\d{2}/.test(iso) ? `${iso}Z` : `${iso}T00:00:00Z`;
}

/** A Pipedrive person reference can be an object or a bare id — normalize. */
export function pdRefId(raw?: { value?: number } | number | null): string {
  if (raw == null) return "";
  if (typeof raw === "number") return String(raw);
  return raw.value != null ? String(raw.value) : "";
}

/** Build the universal stage list for a pipeline: the real (open) stages plus
 *  synthetic Won/Lost stages, so closed deals have somewhere to live. Pure. */
export function pipedriveStages(raw: PdStage[], pipelineId: string): Stage[] {
  const open = raw
    .slice()
    .sort((a, b) => (a.order_nr ?? 0) - (b.order_nr ?? 0))
    .map((s): Stage => {
      const p = s.deal_probability;
      return { id: String(s.id), label: s.name, type: "open", probability: p != null && Number.isFinite(p) ? Math.min(1, Math.max(0, p / 100)) : 0.5 };
    });
  return [
    ...open,
    { id: `${pipelineId}:${WON}`, label: "Won", type: "won", probability: 1 },
    { id: `${pipelineId}:${LOST}`, label: "Lost", type: "lost", probability: 0 },
  ];
}

/** Resolve a deal's universal stage id from its status (won/lost → synthetic). Pure. */
export function pipedriveDealStageId(status: string | undefined, stageId: number | undefined, pipelineId: string): string {
  if (status === WON) return `${pipelineId}:${WON}`;
  if (status === LOST) return `${pipelineId}:${LOST}`;
  return stageId != null ? String(stageId) : "";
}

const ACTIVITY_KIND: Record<string, ActivityKind> = { call: "call", email: "email", meeting: "meeting", task: "task", deadline: "task" };

export class PipedriveProvider implements CrmProvider {
  private token = process.env.PIPEDRIVE_API_TOKEN ?? "";
  private base = (process.env.PIPEDRIVE_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");

  private async req<T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string> }): Promise<PdEnvelope<T>> {
    const url = new URL(`${this.base}${path}`);
    url.searchParams.set("api_token", this.token);
    for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      method: init?.method ?? "GET",
      headers: { Accept: "application/json", ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Pipedrive API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<PdEnvelope<T>>;
  }

  /** GET a collection, following Pipedrive's start/next_start pagination (capped). */
  private async page<T>(path: string, query: Record<string, string> = {}): Promise<T[]> {
    const out: T[] = [];
    let start = 0;
    for (let i = 0; i < 10; i++) {
      const env = await this.req<T[] | null>(path, { query: { ...query, start: String(start), limit: "100" } });
      out.push(...((env.data as T[] | null) ?? []));
      const pg = env.additional_data?.pagination;
      if (!pg?.more_items_in_collection || pg.next_start == null) break;
      start = pg.next_start;
    }
    return out;
  }

  private contactPoints(p: PdPerson): Contact["points"] {
    const vals = (arr?: ({ value?: string } | string)[] | null): string[] =>
      (arr ?? []).map((e) => (typeof e === "string" ? e : e.value ?? "")).filter(Boolean);
    return [
      ...vals(p.email).map((value) => ({ channel: "email" as const, value })),
      ...vals(p.phone).map((value) => ({ channel: "phone" as const, value })),
    ];
  }

  private mapPerson(p: PdPerson): Contact {
    return { id: String(p.id), name: p.name, company: p.org_name ?? p.org_id?.name ?? undefined, points: this.contactPoints(p) };
  }

  private mapDeal(d: PdDeal): Opportunity {
    const pipelineId = d.pipeline_id != null ? String(d.pipeline_id) : "default";
    return {
      id: String(d.id),
      title: d.title,
      pipelineId,
      stageId: pipedriveDealStageId(d.status, d.stage_id, pipelineId),
      value: typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0,
      currency: d.currency ?? "USD",
      contactId: pdRefId(d.person_id),
      ownerId: pdRefId(d.user_id) || undefined,
      createdAt: pdTime(d.add_time) ?? new Date().toISOString(),
      updatedAt: pdTime(d.update_time) ?? new Date().toISOString(),
      lastActivityAt: pdTime(d.last_activity_date) ?? pdTime(d.update_time),
      expectedCloseAt: pdTime(d.expected_close_date),
      closedAt: pdTime(d.won_time) ?? pdTime(d.lost_time),
      lossReason: d.lost_reason ?? undefined,
    };
  }

  info(): ProviderInfo {
    return {
      id: "pipedrive",
      label: "Pipedrive",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: Boolean(this.token),
    };
  }

  async listUsers(): Promise<User[]> {
    const data = await this.req<{ id: number; name: string; email?: string }[]>("/users");
    return (data.data ?? []).map((u) => ({ id: String(u.id), name: u.name, email: u.email }));
  }

  async listPipelines(): Promise<Pipeline[]> {
    const [pipes, stages] = await Promise.all([
      this.req<{ id: number; name: string; order_nr?: number }[]>("/pipelines"),
      this.req<PdStage[]>("/stages"),
    ]);
    const byPipeline = new Map<number, PdStage[]>();
    for (const s of stages.data ?? []) {
      const list = byPipeline.get(s.pipeline_id) ?? [];
      list.push(s);
      byPipeline.set(s.pipeline_id, list);
    }
    return (pipes.data ?? [])
      .sort((a, b) => (a.order_nr ?? 0) - (b.order_nr ?? 0))
      .map((p) => ({ id: String(p.id), label: p.name, stages: pipedriveStages(byPipeline.get(p.id) ?? [], String(p.id)) }));
  }

  async listContacts(): Promise<Contact[]> {
    const data = await this.page<PdPerson>("/persons");
    return data.map((p) => this.mapPerson(p));
  }

  async getContact(id: Id): Promise<Contact | null> {
    try {
      const data = await this.req<PdPerson>(`/persons/${encodeURIComponent(id)}`);
      return data.data ? this.mapPerson(data.data) : null;
    } catch {
      return null;
    }
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const data = await this.page<PdDeal>("/deals", { status: "all_not_deleted" });
    let out = data.map((d) => this.mapDeal(d));
    if (filter?.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    if (filter?.staleSince) out = out.filter((o) => !o.lastActivityAt || o.lastActivityAt <= filter.staleSince!);
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    try {
      const data = await this.req<PdDeal>(`/deals/${encodeURIComponent(id)}`);
      return data.data ? this.mapDeal(data.data) : null;
    } catch {
      return null;
    }
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const email = input.points.filter((p) => p.channel === "email").map((p) => p.value);
    const phone = input.points.filter((p) => p.channel === "phone" || p.channel === "sms").map((p) => p.value);
    const created = await this.req<PdPerson>("/persons", { method: "POST", body: { name: input.name, email, phone } });
    return { ...this.mapPerson(created.data), points: input.points, company: input.company };
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    const body: Record<string, unknown> = {
      title: input.title,
      value: input.value,
      currency: input.currency,
      pipeline_id: Number(input.pipelineId),
      person_id: Number(input.contactId),
    };
    const stageNum = Number(input.stageId);
    if (Number.isFinite(stageNum)) body.stage_id = stageNum; // skip synthetic won/lost ids
    if (input.ownerId) body.user_id = Number(input.ownerId);
    if (input.expectedCloseAt) body.expected_close_date = input.expectedCloseAt.slice(0, 10);
    const created = await this.req<PdDeal>("/deals", { method: "POST", body });
    return this.mapDeal(created.data);
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    // A synthetic Won/Lost target sets the deal status; a real stage sets stage_id
    // and reopens the deal.
    const body: Record<string, unknown> = stageId.endsWith(`:${WON}`)
      ? { status: WON }
      : stageId.endsWith(`:${LOST}`)
        ? { status: LOST }
        : { stage_id: Number(stageId), status: "open" };
    const updated = await this.req<PdDeal>(`/deals/${encodeURIComponent(id)}`, { method: "PUT", body });
    return this.mapDeal(updated.data);
  }

  private mapActivity(a: { id: number; type?: string; subject?: string; note?: string; add_time?: string; due_date?: string; deal_id?: number; person_id?: number }): Activity {
    const summary = [a.subject, a.note].filter(Boolean).join(" — ") || a.type || "activity";
    return {
      id: String(a.id),
      opportunityId: a.deal_id != null ? String(a.deal_id) : undefined,
      contactId: a.person_id != null ? String(a.person_id) : undefined,
      kind: (a.type && ACTIVITY_KIND[a.type]) || "note",
      summary,
      occurredAt: pdTime(a.add_time) ?? pdTime(a.due_date) ?? new Date().toISOString(),
    };
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    const data = await this.req<{ id: number; type?: string; subject?: string; note?: string; add_time?: string; due_date?: string; deal_id?: number; person_id?: number }[]>(
      `/deals/${encodeURIComponent(opportunityId)}/activities`,
      { query: { limit: "100" } },
    );
    return (data.data ?? []).map((a) => this.mapActivity(a)).sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    try {
      const data = await this.req<{ id: number; type?: string; subject?: string; note?: string; add_time?: string; due_date?: string; deal_id?: number; person_id?: number }[]>(
        "/activities",
        { query: { limit: String(Math.min(limit, 100)) } },
      );
      return (data.data ?? []).map((a) => this.mapActivity(a)).sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));
    } catch {
      return [];
    }
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    // Record as a Pipedrive note attached to the deal and/or person.
    const body: Record<string, unknown> = { content: input.summary };
    if (input.opportunityId) body.deal_id = Number(input.opportunityId);
    if (input.contactId) body.person_id = Number(input.contactId);
    const created = await this.req<{ id: number; add_time?: string }>("/notes", { method: "POST", body });
    return {
      id: String(created.data?.id ?? Date.now()),
      opportunityId: input.opportunityId,
      contactId: input.contactId,
      kind: input.kind,
      summary: input.summary,
      occurredAt: pdTime(created.data?.add_time) ?? input.occurredAt,
      direction: input.direction,
    };
  }
}
