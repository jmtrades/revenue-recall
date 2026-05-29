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
import { fetchWithRetry } from "@/lib/crm/net";

/**
 * Salesforce CRM adapter (REST + SOQL). Reads an OAuth access token and the org
 * instance URL from SALESFORCE_ACCESS_TOKEN / SALESFORCE_INSTANCE_URL (token
 * refresh is the integrator's responsibility — supply a current token from your
 * connected app). Maps Salesforce's Contacts / Opportunities / OpportunityStage
 * / Users onto the universal model.
 *
 * Notes on the Salesforce data model:
 * - Opportunity stages are a global picklist (OpportunityStage), so there's one
 *   "pipeline" and an Opportunity references its stage by NAME, not id — so our
 *   stage ids ARE the stage names.
 * - Opportunities have no direct Contact field; the primary contact comes from
 *   OpportunityContactRole, which we resolve in one extra query.
 */

const DEFAULT_VERSION = "60.0";
const ACTIVITY_KIND: Record<string, ActivityKind> = { Call: "call", Email: "email", Task: "task" };

/** Escape a value for safe interpolation into a SOQL string literal. */
export function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Map a Salesforce OpportunityStage to the universal terminal/probability model. Pure. */
export function salesforceStageType(s: { IsClosed?: boolean; IsWon?: boolean; DefaultProbability?: number | null }): { type: Stage["type"]; probability: number } {
  if (s.IsWon) return { type: "won", probability: 1 };
  if (s.IsClosed) return { type: "lost", probability: 0 };
  const p = s.DefaultProbability;
  return { type: "open", probability: p != null && Number.isFinite(p) ? Math.min(1, Math.max(0, p / 100)) : 0.5 };
}

/** Salesforce dates come as ISO already; pass through, undefined-safe. */
function sfDate(raw?: string | null): string | undefined {
  return raw ?? undefined;
}

interface SfContact {
  Id: string;
  Name: string;
  Email?: string | null;
  Phone?: string | null;
  Account?: { Name?: string | null } | null;
}
interface SfOpp {
  Id: string;
  Name: string;
  Amount?: number | null;
  StageName?: string | null;
  CloseDate?: string | null;
  CreatedDate?: string | null;
  LastModifiedDate?: string | null;
  OwnerId?: string | null;
}

const DEFAULT_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";

export class SalesforceProvider implements CrmProvider {
  private token = process.env.SALESFORCE_ACCESS_TOKEN ?? "";
  private instance = (process.env.SALESFORCE_INSTANCE_URL ?? "").replace(/\/$/, "");
  private version = process.env.SALESFORCE_API_VERSION ?? DEFAULT_VERSION;
  // OAuth refresh: Salesforce access tokens are short-lived, so when a refresh
  // token + connected-app client id are configured we transparently refresh on
  // 401 (and proactively when only a refresh token is supplied).
  private refreshToken = process.env.SALESFORCE_REFRESH_TOKEN ?? "";
  private clientId = process.env.SALESFORCE_CLIENT_ID ?? "";
  private clientSecret = process.env.SALESFORCE_CLIENT_SECRET ?? "";
  private tokenUrl = process.env.SALESFORCE_TOKEN_URL ?? DEFAULT_TOKEN_URL;
  private refreshing: Promise<boolean> | null = null;

  private get base(): string {
    return `${this.instance}/services/data/v${this.version}`;
  }

  private get canRefresh(): boolean {
    return Boolean(this.refreshToken && this.clientId);
  }

  private send(path: string, init?: { method?: string; body?: unknown; absolute?: boolean }): Promise<Response> {
    const url = init?.absolute ? `${this.instance}${path}` : `${this.base}${path}`;
    return fetchWithRetry(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  }

  /** Exchange the refresh token for a fresh access token (single-flight). */
  private refresh(): Promise<boolean> {
    if (!this.canRefresh) return Promise.resolve(false);
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken, client_id: this.clientId });
        if (this.clientSecret) body.set("client_secret", this.clientSecret);
        const res = await fetchWithRetry(this.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: body.toString(),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access_token?: string; instance_url?: string };
        if (!data.access_token) return false;
        this.token = data.access_token;
        if (data.instance_url) this.instance = data.instance_url.replace(/\/$/, "");
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async req<T>(path: string, init?: { method?: string; body?: unknown; absolute?: boolean }): Promise<T> {
    // Acquire a token up front if we only have refresh credentials.
    if (!this.token && this.canRefresh) await this.refresh();
    let res = await this.send(path, init);
    if (res.status === 401 && (await this.refresh())) res = await this.send(path, init);
    if (!res.ok) throw new Error(`Salesforce API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** Run a SOQL query, following nextRecordsUrl pagination (capped). */
  private async query<T>(soql: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = `/query?q=${encodeURIComponent(soql)}`;
    for (let i = 0; i < 10 && next; i++) {
      const data: { records: T[]; done: boolean; nextRecordsUrl?: string } = await this.req<{ records: T[]; done: boolean; nextRecordsUrl?: string }>(next, { absolute: next.startsWith("/services") });
      out.push(...(data.records ?? []));
      next = data.done ? undefined : data.nextRecordsUrl;
    }
    return out;
  }

  private mapContact(c: SfContact): Contact {
    return {
      id: c.Id,
      name: c.Name,
      company: c.Account?.Name ?? undefined,
      points: [
        ...(c.Email ? [{ channel: "email" as const, value: c.Email }] : []),
        ...(c.Phone ? [{ channel: "phone" as const, value: c.Phone }] : []),
      ],
    };
  }

  private mapOpp(o: SfOpp, contactId: string): Opportunity {
    return {
      id: o.Id,
      title: o.Name,
      pipelineId: "salesforce",
      stageId: o.StageName ?? "",
      value: typeof o.Amount === "number" && Number.isFinite(o.Amount) ? o.Amount : 0,
      currency: "USD",
      contactId,
      ownerId: o.OwnerId ?? undefined,
      createdAt: sfDate(o.CreatedDate) ?? new Date().toISOString(),
      updatedAt: sfDate(o.LastModifiedDate) ?? new Date().toISOString(),
      lastActivityAt: sfDate(o.LastModifiedDate),
      expectedCloseAt: sfDate(o.CloseDate),
    };
  }

  /** Map opportunity id → primary contact id via OpportunityContactRole. */
  private async primaryContacts(oppIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (oppIds.length === 0) return map;
    const inList = oppIds.slice(0, 200).map((id) => `'${soqlEscape(id)}'`).join(",");
    const roles = await this.query<{ OpportunityId: string; ContactId: string; IsPrimary: boolean }>(
      `SELECT OpportunityId, ContactId, IsPrimary FROM OpportunityContactRole WHERE OpportunityId IN (${inList})`,
    );
    // Prefer the primary role; fall back to any role.
    for (const r of roles) if (r.IsPrimary && r.ContactId) map.set(r.OpportunityId, r.ContactId);
    for (const r of roles) if (!map.has(r.OpportunityId) && r.ContactId) map.set(r.OpportunityId, r.ContactId);
    return map;
  }

  info(): ProviderInfo {
    return {
      id: "salesforce",
      label: "Salesforce",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      // Ready with a current access token + instance, OR with refresh
      // credentials we can exchange for one (instance comes back in the refresh).
      ready: Boolean((this.token && this.instance) || this.canRefresh),
    };
  }

  async listUsers(): Promise<User[]> {
    const rows = await this.query<{ Id: string; Name: string; Email?: string }>("SELECT Id, Name, Email FROM User WHERE IsActive = true");
    return rows.map((u) => ({ id: u.Id, name: u.Name, email: u.Email }));
  }

  async listPipelines(): Promise<Pipeline[]> {
    const stages = await this.query<{ MasterLabel: string; IsClosed?: boolean; IsWon?: boolean; DefaultProbability?: number | null; SortOrder?: number }>(
      "SELECT MasterLabel, IsClosed, IsWon, DefaultProbability, SortOrder FROM OpportunityStage ORDER BY SortOrder",
    );
    return [
      {
        id: "salesforce",
        label: "Sales Pipeline",
        stages: stages.map((s): Stage => {
          const { type, probability } = salesforceStageType(s);
          return { id: s.MasterLabel, label: s.MasterLabel, type, probability };
        }),
      },
    ];
  }

  async listContacts(): Promise<Contact[]> {
    const rows = await this.query<SfContact>("SELECT Id, Name, Email, Phone, Account.Name FROM Contact");
    return rows.map((c) => this.mapContact(c));
  }

  async getContact(id: Id): Promise<Contact | null> {
    const rows = await this.query<SfContact>(`SELECT Id, Name, Email, Phone, Account.Name FROM Contact WHERE Id = '${soqlEscape(id)}'`);
    return rows[0] ? this.mapContact(rows[0]) : null;
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const rows = await this.query<SfOpp>("SELECT Id, Name, Amount, StageName, CloseDate, CreatedDate, LastModifiedDate, OwnerId FROM Opportunity");
    const contacts = await this.primaryContacts(rows.map((o) => o.Id));
    let out = rows.map((o) => this.mapOpp(o, contacts.get(o.Id) ?? ""));
    if (filter?.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    if (filter?.staleSince) out = out.filter((o) => !o.lastActivityAt || o.lastActivityAt <= filter.staleSince!);
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const rows = await this.query<SfOpp>(`SELECT Id, Name, Amount, StageName, CloseDate, CreatedDate, LastModifiedDate, OwnerId FROM Opportunity WHERE Id = '${soqlEscape(id)}'`);
    if (!rows[0]) return null;
    const contacts = await this.primaryContacts([id]);
    return this.mapOpp(rows[0], contacts.get(id) ?? "");
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const body: Record<string, unknown> = { LastName: input.name };
    const email = input.points.find((p) => p.channel === "email")?.value;
    const phone = input.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value;
    if (email) body.Email = email;
    if (phone) body.Phone = phone;
    const created = await this.req<{ id: string }>("/sobjects/Contact", { method: "POST", body });
    return { id: created.id, name: input.name, company: input.company, points: input.points };
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    // CloseDate is required by Salesforce — default to ~30 days out.
    const closeDate = (input.expectedCloseAt ?? new Date(Date.now() + 30 * 86400000).toISOString()).slice(0, 10);
    const body: Record<string, unknown> = { Name: input.title, StageName: input.stageId, CloseDate: closeDate, Amount: input.value };
    if (input.ownerId) body.OwnerId = input.ownerId;
    const created = await this.req<{ id: string }>("/sobjects/Opportunity", { method: "POST", body });
    // Link the contact via an OpportunityContactRole (best-effort, primary).
    if (input.contactId) {
      await this.req("/sobjects/OpportunityContactRole", {
        method: "POST",
        body: { OpportunityId: created.id, ContactId: input.contactId, IsPrimary: true },
      }).catch(() => undefined);
    }
    return {
      id: created.id,
      title: input.title,
      pipelineId: "salesforce",
      stageId: input.stageId,
      value: input.value,
      currency: input.currency,
      contactId: input.contactId,
      ownerId: input.ownerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expectedCloseAt: `${closeDate}T00:00:00Z`,
    };
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    // Salesforce opportunities reference stages by name, which is our stage id.
    await this.req(`/sobjects/Opportunity/${encodeURIComponent(id)}`, { method: "PATCH", body: { StageName: stageId } });
    const updated = await this.getOpportunity(id);
    if (!updated) throw new Error("Opportunity not found after update.");
    return updated;
  }

  private mapTask(t: { Id: string; Subject?: string | null; Description?: string | null; TaskSubtype?: string | null; ActivityDate?: string | null; CreatedDate?: string | null; WhatId?: string | null; WhoId?: string | null }): Activity {
    const summary = [t.Subject, t.Description].filter(Boolean).join(" — ") || t.TaskSubtype || "task";
    return {
      id: t.Id,
      opportunityId: t.WhatId ?? undefined,
      contactId: t.WhoId ?? undefined,
      kind: (t.TaskSubtype && ACTIVITY_KIND[t.TaskSubtype]) || "task",
      summary,
      occurredAt: sfDate(t.CreatedDate) ?? sfDate(t.ActivityDate) ?? new Date().toISOString(),
    };
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    const rows = await this.query<{ Id: string; Subject?: string; Description?: string; TaskSubtype?: string; ActivityDate?: string; CreatedDate?: string; WhatId?: string; WhoId?: string }>(
      `SELECT Id, Subject, Description, TaskSubtype, ActivityDate, CreatedDate, WhatId, WhoId FROM Task WHERE WhatId = '${soqlEscape(opportunityId)}' ORDER BY CreatedDate DESC`,
    );
    return rows.map((t) => this.mapTask(t));
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    try {
      const rows = await this.query<{ Id: string; Subject?: string; Description?: string; TaskSubtype?: string; ActivityDate?: string; CreatedDate?: string; WhatId?: string; WhoId?: string }>(
        `SELECT Id, Subject, Description, TaskSubtype, ActivityDate, CreatedDate, WhatId, WhoId FROM Task ORDER BY CreatedDate DESC LIMIT ${Math.min(Math.max(1, limit), 100)}`,
      );
      return rows.map((t) => this.mapTask(t));
    } catch {
      return [];
    }
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    const body: Record<string, unknown> = {
      Subject: input.summary.slice(0, 255),
      Description: input.summary,
      Status: "Completed",
      ActivityDate: (input.occurredAt ?? new Date().toISOString()).slice(0, 10),
    };
    if (input.opportunityId) body.WhatId = input.opportunityId;
    if (input.contactId) body.WhoId = input.contactId;
    const created = await this.req<{ id: string }>("/sobjects/Task", { method: "POST", body });
    return {
      id: created.id,
      opportunityId: input.opportunityId,
      contactId: input.contactId,
      kind: input.kind,
      summary: input.summary,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      direction: input.direction,
    };
  }
}
