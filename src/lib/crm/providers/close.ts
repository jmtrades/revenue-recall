import type {
  Activity,
  Contact,
  CrmProvider,
  Id,
  Opportunity,
  OpportunityFilter,
  Pipeline,
  ProviderInfo,
  Stage,
  User,
} from "@/lib/crm/types";

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

export class CloseProvider implements CrmProvider {
  private key = process.env.CLOSE_API_KEY ?? "";

  private async req<T>(path: string): Promise<T> {
    const auth = Buffer.from(`${this.key}:`).toString("base64");
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Close API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
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
    const data = await this.req<{
      data: {
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
      }[];
    }>("/opportunity/");
    let out: Opportunity[] = data.data.map((o) => ({
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
    }));
    if (filter?.staleSince) out = out.filter((o) => !o.lastActivityAt || o.lastActivityAt <= filter.staleSince!);
    if (filter?.ownerId) out = out.filter((o) => o.ownerId === filter.ownerId);
    return out;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const all = await this.listOpportunities();
    return all.find((o) => o.id === id) ?? null;
  }

  async moveOpportunity(): Promise<Opportunity> {
    throw new Error("Close write operations require a configured webhook/OAuth flow — not enabled in this build.");
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

  async logActivity(): Promise<Activity> {
    throw new Error("Close write operations are not enabled in this build.");
  }
}
