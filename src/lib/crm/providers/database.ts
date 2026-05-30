import type {
  Activity,
  Contact,
  ContactPoint,
  CrmProvider,
  Id,
  NewActivity,
  NewContact,
  NewOpportunity,
  Opportunity,
  ProviderInfo,
  Stage,
  User,
} from "@/lib/crm/types";
import { BuiltinProvider } from "@/lib/crm/providers/builtin";

/**
 * Generic database / data-source adapter — "connect any database, even if it's
 * not a normal CRM."
 *
 * Most leads don't live in HubSpot. They live in a plain Postgres table, a
 * Google Sheet, an Airtable base, a warehouse view. This adapter points at any
 * endpoint that returns rows as JSON and maps that table's *own* column names
 * onto the universal contact/opportunity model. That's the difference from the
 * HTTP CRM adapter, which requires the backend to already speak our exact
 * shape — here you bring your columns and we adapt to them.
 *
 * Works out of the box with:
 *   - PostgREST  (the standard way to expose any Postgres table over REST)
 *   - Supabase REST / Airtable / NocoDB / Baserow / Google Sheets-as-JSON
 *   - any endpoint returning an array of row objects (or {rows|data|records:[…]})
 *
 * Config (inert until DATA_SOURCE_URL is set):
 *   DATA_SOURCE_URL      endpoint returning lead rows as JSON
 *   DATA_SOURCE_TOKEN    optional bearer token
 *   DATA_SOURCE_MAPPING  optional JSON, target→source column, e.g.
 *                        {"name":"full_name","email":"email_address",
 *                         "phone":"mobile","company":"account",
 *                         "value":"deal_size","stage":"status","id":"uuid"}
 *
 * When no mapping is given we auto-detect columns by common header aliases, so
 * a sensible table just works. Reads come from your database; writes the agent
 * makes (logged calls/emails, new contacts) are held in a local layer and
 * merged into reads, so the rest of the system stays fully functional.
 */

export type DataField = "id" | "name" | "company" | "title" | "email" | "phone" | "value" | "stage" | "owner";

const ALIASES: Record<DataField, string[]> = {
  id: ["id", "uuid", "lead_id", "contact_id", "record_id", "_id"],
  name: ["name", "full_name", "fullname", "contact", "contact_name", "lead", "first_last", "customer"],
  company: ["company", "company_name", "account", "account_name", "organization", "organisation", "org", "business"],
  title: ["title", "job_title", "role", "position"],
  email: ["email", "email_address", "e-mail", "work_email", "contact_email"],
  phone: ["phone", "phone_number", "mobile", "cell", "telephone", "tel", "contact_number"],
  value: ["value", "deal_value", "deal_size", "amount", "revenue", "mrr", "arr", "contract_value", "price"],
  stage: ["stage", "status", "deal_stage", "pipeline_stage", "lead_status", "state"],
  owner: ["owner", "owner_name", "assigned_to", "rep", "account_owner", "sales_rep"],
};

const STAGE_MAP: Record<string, Stage> = {
  lead: "lead", new: "lead", open: "lead", cold: "lead", prospect: "lead",
  qualified: "qualified", mql: "qualified", sql: "qualified", contacted: "qualified", working: "qualified",
  proposal: "proposal", quote: "proposal", quoted: "proposal", demo: "proposal",
  negotiation: "negotiation", negotiating: "negotiation", contract: "negotiation", pending: "negotiation",
  won: "won", closed_won: "won", "closed won": "won", customer: "won", paid: "won", active: "won",
  lost: "lost", closed_lost: "lost", "closed lost": "lost", dead: "lost", churned: "lost", disqualified: "lost",
};

type Row = Record<string, unknown>;

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
}

export function databaseConfigured(): boolean {
  return Boolean(env("DATA_SOURCE_URL"));
}

/** Parse the optional user mapping; ignore malformed JSON rather than crash. */
function readMapping(): Partial<Record<DataField, string>> {
  const raw = env("DATA_SOURCE_MAPPING");
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<DataField, string>> = {};
    for (const f of Object.keys(ALIASES) as DataField[]) {
      const v = obj[f];
      if (typeof v === "string" && v.length > 0) out[f] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Case/format-insensitive key lookup so "Full Name" matches "full_name". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-.]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function pickValue(row: Row, normIndex: Map<string, string>, mapping: Partial<Record<DataField, string>>, field: DataField): unknown {
  const explicit = mapping[field];
  if (explicit && explicit in row) return row[explicit];
  if (explicit) {
    const k = normIndex.get(norm(explicit));
    if (k) return row[k];
  }
  for (const alias of ALIASES[field]) {
    const k = normIndex.get(norm(alias));
    if (k && row[k] != null && row[k] !== "") return row[k];
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeStage(v: unknown): Stage {
  const s = norm(String(v ?? ""));
  return STAGE_MAP[s] ?? STAGE_MAP[s.replace(/_/g, " ")] ?? "lead";
}

/** Unwrap the common row-list envelopes returned by real data sources. */
export function extractRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    // Airtable: { records: [{ id, fields:{…} }] }
    if (Array.isArray(o.records)) {
      return (o.records as Row[]).map((r) =>
        r && typeof r === "object" && "fields" in r && r.fields && typeof r.fields === "object"
          ? { ...(r.fields as Row), id: (r as Row).id }
          : r,
      );
    }
    for (const k of ["rows", "data", "results", "items", "value"]) {
      if (Array.isArray(o[k])) return o[k] as Row[];
    }
  }
  return [];
}

export class DatabaseProvider implements CrmProvider {
  private url: string;
  private token?: string;
  private mapping: Partial<Record<DataField, string>>;
  private local = new BuiltinProvider();
  private cache: { contacts: Contact[]; opportunities: Opportunity[] } | null = null;

  constructor() {
    this.url = env("DATA_SOURCE_URL") ?? "";
    this.token = env("DATA_SOURCE_TOKEN");
    this.mapping = readMapping();
  }

  info(): ProviderInfo {
    return {
      id: "database",
      label: "Connected database",
      ready: Boolean(this.url),
      capabilities: { read: true, write: true },
    };
  }

  private async fetchRows(): Promise<Row[]> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.url, { headers });
    if (!res.ok) throw new Error(`data source ${res.status}`);
    return extractRows(await res.json().catch(() => null));
  }

  /** Map external rows → universal model once, then merge with the local layer. */
  private async loadExternal(): Promise<{ contacts: Contact[]; opportunities: Opportunity[] }> {
    if (this.cache) return this.cache;
    let rows: Row[] = [];
    try {
      rows = await this.fetchRows();
    } catch {
      rows = [];
    }
    const contacts: Contact[] = [];
    const opportunities: Opportunity[] = [];
    rows.forEach((row, i) => {
      const index = new Map<string, string>();
      for (const key of Object.keys(row)) index.set(norm(key), key);

      const name = str(pickValue(row, index, this.mapping, "name"));
      const email = str(pickValue(row, index, this.mapping, "email"));
      const phone = str(pickValue(row, index, this.mapping, "phone"));
      if (!name && !email && !phone) return; // skip empty rows

      const rawId = str(pickValue(row, index, this.mapping, "id"));
      const id = `db_${rawId ?? email ?? `${norm(name ?? "row")}_${i}`}`;
      const points: ContactPoint[] = [];
      if (email) points.push({ channel: "email", value: email });
      if (phone) points.push({ channel: "phone", value: phone });

      contacts.push({
        id,
        name: name ?? email ?? phone ?? `Lead ${i + 1}`,
        company: str(pickValue(row, index, this.mapping, "company")),
        title: str(pickValue(row, index, this.mapping, "title")),
        owner: str(pickValue(row, index, this.mapping, "owner")),
        points,
        attributes: { source: "database" },
      });

      const valueRaw = pickValue(row, index, this.mapping, "value");
      const stageRaw = pickValue(row, index, this.mapping, "stage");
      if (valueRaw != null || stageRaw != null) {
        opportunities.push({
          id: `dbo_${rawId ?? email ?? i}`,
          title: `${name ?? email ?? "Lead"}${contacts[contacts.length - 1].company ? ` — ${contacts[contacts.length - 1].company}` : ""}`,
          contactId: id,
          stage: normalizeStage(stageRaw),
          value: num(valueRaw),
        });
      }
    });
    this.cache = { contacts, opportunities };
    return this.cache;
  }

  async listUsers(): Promise<User[]> {
    return this.local.listUsers();
  }

  async listContacts(): Promise<Contact[]> {
    const [ext, local] = await Promise.all([this.loadExternal(), this.local.listContacts()]);
    return [...ext.contacts, ...local];
  }

  async getContact(id: Id): Promise<Contact | null> {
    const ext = await this.loadExternal();
    return ext.contacts.find((c) => c.id === id) ?? (await this.local.getContact(id));
  }

  async createContact(input: NewContact): Promise<Contact> {
    return this.local.createContact(input);
  }

  async updateContact(id: Id, patch: Partial<NewContact>): Promise<Contact> {
    return this.local.updateContact(id, patch);
  }

  async listOpportunities(): Promise<Opportunity[]> {
    const [ext, local] = await Promise.all([this.loadExternal(), this.local.listOpportunities()]);
    return [...ext.opportunities, ...local];
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const ext = await this.loadExternal();
    return ext.opportunities.find((o) => o.id === id) ?? (await this.local.getOpportunity(id));
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    return this.local.createOpportunity(input);
  }

  async updateOpportunity(id: Id, patch: Partial<NewOpportunity>): Promise<Opportunity> {
    return this.local.updateOpportunity(id, patch);
  }

  async listActivities(): Promise<Activity[]> {
    return this.local.listActivities();
  }

  async listActivitiesByContact(contactId: Id): Promise<Activity[]> {
    const all = await this.local.listActivities();
    return all.filter((a) => a.contactId === contactId);
  }

  async logActivity(input: NewActivity): Promise<Activity> {
    return this.local.logActivity(input);
  }
}
