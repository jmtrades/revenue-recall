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

/**
 * Generic HTTP CRM adapter — connect ANY CRM, no per-vendor code. Point it at a
 * thin REST endpoint (yours, an automation tool, or a CRM that already speaks
 * the universal shape) via CRM_HTTP_BASE_URL (+ optional CRM_HTTP_TOKEN bearer).
 * It maps 1:1 onto the universal domain model the rest of the app uses, so the
 * dashboard, recall engine, and agents work unchanged.
 *
 * Expected endpoints (all relative to the base URL):
 *   GET    /users                          -> User[]
 *   GET    /pipelines                      -> Pipeline[]
 *   GET    /contacts                       -> Contact[]
 *   GET    /contacts/:id                   -> Contact | null
 *   POST   /contacts                       -> Contact          (body: Omit<Contact,"id">)
 *   GET    /opportunities[?stageType=&ownerId=&…] -> Opportunity[]
 *   GET    /opportunities/:id              -> Opportunity | null
 *   POST   /opportunities                  -> Opportunity      (body: NewOpportunity)
 *   POST   /opportunities/:id/move         -> Opportunity      (body: { stageId })
 *   GET    /opportunities/:id/activities   -> Activity[]
 *   GET    /activities?limit=N             -> Activity[]
 *   POST   /activities                     -> Activity         (body: Omit<Activity,"id">)
 */
export class HttpCrmProvider implements CrmProvider {
  private base = (process.env.CRM_HTTP_BASE_URL ?? "").replace(/\/$/, "");
  private token = process.env.CRM_HTTP_TOKEN ?? "";

  info(): ProviderInfo {
    return {
      id: "http",
      label: "Custom CRM (HTTP)",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: Boolean(this.base),
    };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`CRM HTTP ${res.status} on GET ${path}`);
    return (await res.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`CRM HTTP ${res.status} on POST ${path}`);
    return (await res.json()) as T;
  }

  private arr<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
  }

  async listUsers(): Promise<User[]> {
    return this.arr<User>(await this.get("/users"));
  }
  async listPipelines(): Promise<Pipeline[]> {
    return this.arr<Pipeline>(await this.get("/pipelines"));
  }
  async listContacts(): Promise<Contact[]> {
    return this.arr<Contact>(await this.get("/contacts"));
  }
  async getContact(id: Id): Promise<Contact | null> {
    return (await this.get<Contact | null>(`/contacts/${encodeURIComponent(id)}`)) ?? null;
  }
  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    return this.post<Contact>("/contacts", input);
  }
  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const qs = filter
      ? "?" +
        new URLSearchParams(
          Object.entries(filter).reduce<Record<string, string>>((acc, [k, v]) => {
            if (v !== undefined && v !== null) acc[k] = String(v);
            return acc;
          }, {}),
        ).toString()
      : "";
    return this.arr<Opportunity>(await this.get(`/opportunities${qs}`));
  }
  async getOpportunity(id: Id): Promise<Opportunity | null> {
    return (await this.get<Opportunity | null>(`/opportunities/${encodeURIComponent(id)}`)) ?? null;
  }
  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    return this.post<Opportunity>("/opportunities", input);
  }
  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    return this.post<Opportunity>(`/opportunities/${encodeURIComponent(id)}/move`, { stageId });
  }
  async listActivities(opportunityId: Id): Promise<Activity[]> {
    return this.arr<Activity>(await this.get(`/opportunities/${encodeURIComponent(opportunityId)}/activities`));
  }
  async listRecentActivities(limit: number): Promise<Activity[]> {
    return this.arr<Activity>(await this.get(`/activities?limit=${limit}`));
  }
  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    return this.post<Activity>("/activities", input);
  }
}
