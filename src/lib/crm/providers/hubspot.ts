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
 * HubSpot CRM adapter (https://developers.hubspot.com/docs/api/crm). Reads a
 * Private App token from HUBSPOT_ACCESS_TOKEN and maps HubSpot's
 * contacts / deals / pipelines / owners / engagements onto the universal model.
 * When no token is present it reports `ready: false` and the registry falls back
 * to the built-in provider.
 */

const API = "https://api.hubapi.com";
const MAX_PAGES = 10; // safety cap on pagination (×100 = up to 1000 records)

const DEAL_PROPS = ["dealname", "amount", "dealstage", "pipeline", "createdate", "hs_lastmodifieddate", "closedate", "hubspot_owner_id", "deal_currency_code"];
const CONTACT_PROPS = ["firstname", "lastname", "email", "phone", "company"];

interface HsObject<P = Record<string, string | null>> {
  id: string;
  properties: P;
  associations?: { contacts?: { results?: { id: string }[] } };
}
interface HsStage {
  id: string;
  label: string;
  displayOrder?: number;
  metadata?: { isClosed?: string; probability?: string };
}
interface HsPipeline {
  id: string;
  label: string;
  displayOrder?: number;
  stages: HsStage[];
}

/** Map a HubSpot deal stage's metadata to our terminal/probability model.
 *  Pure and exported for tests. */
export function hubspotStageType(meta?: { isClosed?: string; probability?: string }): { type: Stage["type"]; probability: number } {
  const closed = meta?.isClosed === "true";
  const prob = Number(meta?.probability ?? NaN);
  if (closed) return prob >= 1 ? { type: "won", probability: 1 } : { type: "lost", probability: 0 };
  return { type: "open", probability: Number.isFinite(prob) ? Math.min(1, Math.max(0, prob)) : 0.5 };
}

/** Parse a HubSpot deal amount (string, major units) to a plain number.
 *  Pure and exported for tests. */
export function hubspotAmount(raw?: string | null): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// HubSpot engagement object types we read, with the property that holds their
// body and (optionally) their direction. hs_timestamp carries the event time.
const ENGAGEMENTS: { type: string; kind: ActivityKind; body: string[]; direction?: string }[] = [
  { type: "notes", kind: "note", body: ["hs_note_body"] },
  { type: "calls", kind: "call", body: ["hs_call_title", "hs_call_body"], direction: "hs_call_direction" },
  { type: "emails", kind: "email", body: ["hs_email_subject", "hs_email_text"], direction: "hs_email_direction" },
  { type: "meetings", kind: "meeting", body: ["hs_meeting_title", "hs_meeting_body"] },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export class HubspotProvider implements CrmProvider {
  private token = process.env.HUBSPOT_ACCESS_TOKEN ?? "";

  private async req<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetchWithRetry(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /** GET a v3 object collection, following pagination up to MAX_PAGES. */
  private async page<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const qs = new URLSearchParams({ limit: "100", ...params, ...(after ? { after } : {}) });
      const data = await this.req<{ results: T[]; paging?: { next?: { after?: string } } }>(`${path}?${qs.toString()}`);
      out.push(...(data.results ?? []));
      after = data.paging?.next?.after;
      if (!after) break;
    }
    return out;
  }

  private contactPoints(p: Record<string, string | null>): Contact["points"] {
    return [
      ...(p.email ? [{ channel: "email" as const, value: p.email }] : []),
      ...(p.phone ? [{ channel: "phone" as const, value: p.phone }] : []),
    ];
  }

  private mapContact(c: HsObject): Contact {
    const p = c.properties;
    const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.email || "Unnamed";
    return { id: c.id, name, company: p.company ?? undefined, points: this.contactPoints(p) };
  }

  private mapDeal(d: HsObject): Opportunity {
    const p = d.properties;
    return {
      id: d.id,
      title: p.dealname ?? d.id,
      pipelineId: p.pipeline ?? "default",
      stageId: p.dealstage ?? "",
      value: hubspotAmount(p.amount),
      currency: p.deal_currency_code ?? "USD",
      contactId: d.associations?.contacts?.results?.[0]?.id ?? "",
      ownerId: p.hubspot_owner_id ?? undefined,
      createdAt: p.createdate ?? new Date().toISOString(),
      updatedAt: p.hs_lastmodifieddate ?? new Date().toISOString(),
      lastActivityAt: p.hs_lastmodifieddate ?? undefined,
      closedAt: p.closedate ?? undefined,
    };
  }

  info(): ProviderInfo {
    return {
      id: "hubspot",
      label: "HubSpot",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: Boolean(this.token),
    };
  }

  async listUsers(): Promise<User[]> {
    const owners = await this.page<{ id: string; email?: string; firstName?: string; lastName?: string }>("/crm/v3/owners/", {});
    return owners.map((o) => ({ id: o.id, name: [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || "Owner", email: o.email }));
  }

  async listPipelines(): Promise<Pipeline[]> {
    const data = await this.req<{ results: HsPipeline[] }>("/crm/v3/pipelines/deals");
    return data.results.map((p) => ({
      id: p.id,
      label: p.label,
      stages: [...p.stages]
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s): Stage => {
          const { type, probability } = hubspotStageType(s.metadata);
          return { id: s.id, label: s.label, type, probability };
        }),
    }));
  }

  async listContacts(): Promise<Contact[]> {
    const data = await this.page<HsObject>("/crm/v3/objects/contacts", { properties: CONTACT_PROPS.join(",") });
    return data.map((c) => this.mapContact(c));
  }

  async getContact(id: Id): Promise<Contact | null> {
    try {
      const c = await this.req<HsObject>(`/crm/v3/objects/contacts/${encodeURIComponent(id)}?properties=${CONTACT_PROPS.join(",")}`);
      return this.mapContact(c);
    } catch {
      return null;
    }
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const data = await this.page<HsObject>("/crm/v3/objects/deals", { properties: DEAL_PROPS.join(","), associations: "contacts" });
    let out = data.map((d) => this.mapDeal(d));
    if (filter?.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    if (filter?.staleSince) out = out.filter((o) => !o.lastActivityAt || o.lastActivityAt <= filter.staleSince!);
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    try {
      const d = await this.req<HsObject>(`/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${DEAL_PROPS.join(",")}&associations=contacts`);
      return this.mapDeal(d);
    } catch {
      return null;
    }
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const [firstname, ...rest] = input.name.split(" ");
    const properties: Record<string, string> = { firstname: firstname ?? input.name, lastname: rest.join(" ") };
    if (input.company) properties.company = input.company;
    const email = input.points.find((p) => p.channel === "email")?.value;
    const phone = input.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value;
    if (email) properties.email = email;
    if (phone) properties.phone = phone;
    const created = await this.req<HsObject>("/crm/v3/objects/contacts", { method: "POST", body: { properties } });
    return { ...this.mapContact(created), points: input.points, company: input.company };
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    const properties: Record<string, string> = {
      dealname: input.title,
      amount: String(input.value),
      dealstage: input.stageId,
      pipeline: input.pipelineId,
    };
    if (input.currency) properties.deal_currency_code = input.currency;
    if (input.ownerId) properties.hubspot_owner_id = input.ownerId;
    if (input.expectedCloseAt) properties.closedate = input.expectedCloseAt;
    // Associate the new deal to its contact (deal→contact type id = 3).
    const associations = input.contactId
      ? [{ to: { id: input.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }]
      : [];
    const created = await this.req<HsObject>("/crm/v3/objects/deals", { method: "POST", body: { properties, associations } });
    return { ...this.mapDeal(created), contactId: input.contactId, value: input.value, currency: input.currency, stageId: input.stageId, pipelineId: input.pipelineId };
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    const updated = await this.req<HsObject>(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { properties: { dealstage: stageId } },
    });
    return this.mapDeal(updated);
  }

  /** Read the engagements (notes/calls/emails/meetings) associated with a deal. */
  private async engagementsFor(dealId: Id, opportunityId?: Id): Promise<Activity[]> {
    const perType = await Promise.all(
      ENGAGEMENTS.map(async (eng) => {
        try {
          const assoc = await this.req<{ results: { toObjectId?: string | number; id?: string }[] }>(
            `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/${eng.type}`,
          );
          const ids = (assoc.results ?? []).map((r) => String(r.toObjectId ?? r.id)).filter(Boolean).slice(0, 50);
          if (ids.length === 0) return [];
          const props = [...eng.body, "hs_timestamp", "hs_createdate", ...(eng.direction ? [eng.direction] : [])];
          const batch = await this.req<{ results: HsObject[] }>(`/crm/v3/objects/${eng.type}/batch/read`, {
            method: "POST",
            body: { properties: props, inputs: ids.map((id) => ({ id })) },
          });
          return (batch.results ?? []).map((o): Activity => {
            const p = o.properties;
            const body = eng.body.map((b) => p[b]).filter(Boolean).join(" — ");
            const dir = eng.direction ? (p[eng.direction] ?? "").toUpperCase() : "";
            const direction = dir.includes("INCOMING") || dir === "INBOUND" ? "inbound" : dir ? "outbound" : undefined;
            return {
              id: o.id,
              opportunityId,
              kind: eng.kind,
              summary: body ? stripHtml(body) : eng.kind,
              occurredAt: p.hs_timestamp ?? p.hs_createdate ?? new Date().toISOString(),
              direction,
            };
          });
        } catch {
          return [];
        }
      }),
    );
    return perType.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    return this.engagementsFor(opportunityId, opportunityId);
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    // Recent notes across the org (best-effort; the feed tolerates partial data).
    try {
      const data = await this.req<{ results: HsObject[] }>("/crm/v3/objects/notes/search", {
        method: "POST",
        body: { sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }], properties: ["hs_note_body", "hs_timestamp"], limit: Math.min(limit, 100) },
      });
      return (data.results ?? []).map((o) => ({
        id: o.id,
        kind: "note" as const,
        summary: o.properties.hs_note_body ? stripHtml(o.properties.hs_note_body) : "note",
        occurredAt: o.properties.hs_timestamp ?? new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    // Record as a HubSpot note, associated to the deal (214) and/or contact (202).
    const associations: { to: { id: string }; types: { associationCategory: string; associationTypeId: number }[] }[] = [];
    if (input.opportunityId) associations.push({ to: { id: input.opportunityId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] });
    if (input.contactId) associations.push({ to: { id: input.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] });
    const created = await this.req<HsObject>("/crm/v3/objects/notes", {
      method: "POST",
      body: {
        properties: { hs_note_body: input.summary, hs_timestamp: input.occurredAt ?? new Date().toISOString() },
        associations,
      },
    });
    return {
      id: created.id,
      opportunityId: input.opportunityId,
      contactId: input.contactId,
      kind: input.kind,
      summary: input.summary,
      occurredAt: created.properties.hs_timestamp ?? input.occurredAt,
      direction: input.direction,
    };
  }
}
