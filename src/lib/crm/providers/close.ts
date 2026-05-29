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
import { fetchWithRetry } from "@/lib/crm/net";

/**
 * Close CRM adapter (https://developer.close.com). Reads CLOSE_API_KEY from the
 * environment. Maps Close's leads/opportunities/statuses onto the universal
 * model. When no key is present it reports `ready: false` and the registry
 * falls back to the built-in provider.
 */

const API = "https://api.close.com/api/v1";

interface CloseStatus {
  id: string;
  label: string;
  type?: string;
}

interface CloseOpportunity {
  id: string;
  status_id: string;
  status_type?: string;
  value?: number;
  value_currency?: string;
  contact_id?: string;
  lead_id?: string;
  user_id?: string;
  date_created: string;
  date_updated: string;
  date_won?: string;
  confidence?: number;
}

interface CloseContact {
  id: string;
  name: string;
  lead_id?: string;
  emails?: { email: string }[];
  phones?: { phone: string }[];
}

export class CloseProvider implements CrmProvider {
  private key = process.env.CLOSE_API_KEY ?? "";

  private async req<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const auth = Buffer.from(`${this.key}:`).toString("base64");
    const res = await fetchWithRetry(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Close API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private mapOpp(o: CloseOpportunity): Opportunity {
    return {
      id: o.id,
      title: o.lead_id ?? o.id,
      pipelineId: "close",
      stageId: o.status_id,
      value: (o.value ?? 0) / 100,
      currency: o.value_currency ?? "USD",
      contactId: o.contact_id ?? "",
      ownerId: o.user_id,
      createdAt: o.date_created,
      updatedAt: o.date_updated,
      lastActivityAt: o.date_updated,
      closedAt: o.date_won,
    };
  }

  info(): ProviderInfo {
    return {
      id: "close",
      label: "Close CRM",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: Boolean(this.key),
    };
  }

  async listUsers(): Promise<User[]> {
    const data = await this.req<{ data: { id: string; first_name: string; last_name: string; email: string }[] }>("/user/");
    return data.data.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim(), email: u.email }));
  }

  async listPipelines(): Promise<Pipeline[]> {
    const [pipes, statuses] = await Promise.all([
      this.req<{ data: { id: string; name: string }[] }>("/pipeline/"),
      this.req<{ data: CloseStatus[] }>("/status/opportunity/"),
    ]);
    const toStage = (s: CloseStatus, i: number, total: number): Stage => {
      const type = s.type === "won" ? "won" : s.type === "lost" ? "lost" : "open";
      return { id: s.id, label: s.label, type, probability: type === "won" ? 1 : type === "lost" ? 0 : (i + 1) / (total + 1) };
    };
    return pipes.data.map((p) => ({
      id: p.id,
      label: p.name,
      stages: statuses.data.map((s, i) => toStage(s, i, statuses.data.length)),
    }));
  }

  async listContacts(): Promise<Contact[]> {
    const data = await this.req<{ data: { id: string; name: string; emails?: { email: string }[]; phones?: { phone: string }[] }[] }>("/contact/");
    return data.data.map((c) => ({
      id: c.id,
      name: c.name,
      points: [
        ...(c.emails ?? []).map((e) => ({ channel: "email" as const, value: e.email })),
        ...(c.phones ?? []).map((p) => ({ channel: "phone" as const, value: p.phone })),
      ],
    }));
  }

  async getContact(id: Id): Promise<Contact | null> {
    try {
      const c = await this.req<{ id: string; name: string; emails?: { email: string }[]; phones?: { phone: string }[] }>(`/contact/${id}/`);
      return {
        id: c.id,
        name: c.name,
        points: [
          ...(c.emails ?? []).map((e) => ({ channel: "email" as const, value: e.email })),
          ...(c.phones ?? []).map((p) => ({ channel: "phone" as const, value: p.phone })),
        ],
      };
    } catch {
      return null;
    }
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const data = await this.req<{ data: CloseOpportunity[] }>("/opportunity/");
    let out: Opportunity[] = data.data.map((o) => this.mapOpp(o));
    if (filter?.staleSince) out = out.filter((o) => !o.lastActivityAt || o.lastActivityAt <= filter.staleSince!);
    if (filter?.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const all = await this.listOpportunities();
    return all.find((o) => o.id === id) ?? null;
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    // Close contacts always belong to a lead, so creating a standalone contact
    // means creating a lead that contains it. We name the lead after the
    // company (falling back to the contact's name).
    const emails = input.points.filter((p) => p.channel === "email").map((p) => ({ email: p.value, type: "office" }));
    const phones = input.points.filter((p) => p.channel === "phone").map((p) => ({ phone: p.value, type: "office" }));
    const lead = await this.req<{ id: string; contacts?: CloseContact[] }>("/lead/", {
      method: "POST",
      body: { name: input.company ?? input.name, contacts: [{ name: input.name, emails, phones }] },
    });
    const created = lead.contacts?.[0];
    return {
      id: created?.id ?? lead.id,
      name: created?.name ?? input.name,
      company: input.company,
      points: input.points,
    };
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    // Resolve the contact's lead — Close opportunities hang off a lead, not a
    // contact — then create the opportunity in the requested status (stage).
    const contact = await this.req<CloseContact>(`/contact/${encodeURIComponent(input.contactId)}/`);
    if (!contact.lead_id) throw new Error("Contact is not attached to a Close lead.");
    const created = await this.req<CloseOpportunity>("/opportunity/", {
      method: "POST",
      body: {
        lead_id: contact.lead_id,
        contact_id: input.contactId,
        status_id: input.stageId,
        value: Math.round(input.value * 100),
        value_period: "one_time",
        value_currency: input.currency,
        user_id: input.ownerId,
      },
    });
    return this.mapOpp(created);
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    const updated = await this.req<CloseOpportunity>(`/opportunity/${encodeURIComponent(id)}/`, {
      method: "PUT",
      body: { status_id: stageId },
    });
    return this.mapOpp(updated);
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    const data = await this.req<{ data: { id: string; _type: string; date_created: string; note?: string }[] }>(
      `/activity/?opportunity_id=${encodeURIComponent(opportunityId)}`,
    );
    return data.data.map((a) => ({
      id: a.id,
      opportunityId,
      kind: (a._type as Activity["kind"]) ?? "note",
      summary: a.note ?? a._type,
      occurredAt: a.date_created,
    }));
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    const data = await this.req<{ data: { id: string; _type: string; date_created: string; note?: string; opportunity_id?: string }[] }>(
      `/activity/?_limit=${limit}`,
    );
    return data.data.map((a) => ({
      id: a.id,
      opportunityId: a.opportunity_id,
      kind: (a._type as Activity["kind"]) ?? "note",
      summary: a.note ?? a._type,
      occurredAt: a.date_created,
    }));
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    // Close activities attach to a lead. Resolve the lead from the opportunity
    // (or contact) the activity belongs to, then record it as a note.
    let leadId: string | undefined;
    if (input.opportunityId) {
      const opp = await this.req<CloseOpportunity>(`/opportunity/${encodeURIComponent(input.opportunityId)}/`);
      leadId = opp.lead_id;
    } else if (input.contactId) {
      const contact = await this.req<CloseContact>(`/contact/${encodeURIComponent(input.contactId)}/`);
      leadId = contact.lead_id;
    }
    if (!leadId) throw new Error("Could not resolve a Close lead for this activity.");
    const note = await this.req<{ id: string; date_created?: string }>("/activity/note/", {
      method: "POST",
      body: { lead_id: leadId, note: input.summary },
    });
    return {
      id: note.id,
      opportunityId: input.opportunityId,
      contactId: input.contactId,
      kind: input.kind,
      summary: input.summary,
      occurredAt: note.date_created ?? input.occurredAt,
      direction: input.direction,
    };
  }
}
