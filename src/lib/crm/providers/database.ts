import type {
  Activity,
  Contact,
  ContactPoint,
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
import { getConfig } from "@/lib/config";

/**
 * Generic database / data-source adapter — "connect any database, even if it's
 * not a normal CRM."
 *
 * Most leads don't live in a CRM. They live in a plain Postgres table, a Google
 * Sheet, an Airtable base, a warehouse view. This adapter points at any endpoint
 * that returns rows as JSON and maps that table's *own* column names onto the
 * universal contact/opportunity model. That's the difference from the HTTP CRM
 * adapter, which needs the backend to already speak our exact shape — here you
 * bring your columns and we adapt to them.
 *
 * Works out of the box with:
 *   - PostgREST  (the standard way to expose any Postgres table over REST)
 *   - Supabase REST / Airtable / NocoDB / Baserow / Sheets-as-JSON
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
 * With no mapping we auto-detect columns by common header aliases, so a sensible
 * table just works. Reads come from your database; writes the agent makes (logged
 * calls/emails, new contacts, stage moves) are held in a local layer and merged
 * into reads, so the dashboard, recall engine, and agents stay fully functional.
 * Critically, this adapter seeds NO demo data — a connected account shows only
 * its own real rows.
 */

export type DataField = "id" | "name" | "company" | "title" | "email" | "phone" | "value" | "stage";

const ALIASES: Record<DataField, string[]> = {
  id: ["id", "uuid", "lead_id", "contact_id", "record_id", "_id"],
  name: ["name", "full_name", "fullname", "contact", "contact_name", "lead", "customer", "customer_name"],
  company: ["company", "company_name", "account", "account_name", "organization", "organisation", "org", "business"],
  title: ["title", "job_title", "role", "position"],
  email: ["email", "email_address", "e_mail", "work_email", "contact_email"],
  phone: ["phone", "phone_number", "mobile", "cell", "telephone", "tel", "contact_number"],
  value: ["value", "deal_value", "deal_size", "amount", "revenue", "mrr", "arr", "contract_value", "price"],
  stage: ["stage", "status", "deal_stage", "pipeline_stage", "lead_status", "state"],
};

// A standard pipeline this adapter maps every external row onto. The rest of the
// app reasons about deals through these stages regardless of the source table.
export const DB_PIPELINE_ID = "db_pipeline";
const STAGES: Stage[] = [
  { id: "db_lead", label: "Lead", probability: 0.1, type: "open" },
  { id: "db_qualified", label: "Qualified", probability: 0.3, type: "open" },
  { id: "db_proposal", label: "Proposal", probability: 0.5, type: "open" },
  { id: "db_negotiation", label: "Negotiation", probability: 0.75, type: "open" },
  { id: "db_won", label: "Won", probability: 1, type: "won" },
  { id: "db_lost", label: "Lost", probability: 0, type: "lost" },
];
const DB_PIPELINE: Pipeline = { id: DB_PIPELINE_ID, label: "Pipeline", stages: STAGES };

const STAGE_MAP: Record<string, string> = {
  lead: "db_lead", new: "db_lead", open: "db_lead", cold: "db_lead", prospect: "db_lead",
  qualified: "db_qualified", mql: "db_qualified", sql: "db_qualified", contacted: "db_qualified", working: "db_qualified",
  proposal: "db_proposal", quote: "db_proposal", quoted: "db_proposal", demo: "db_proposal",
  negotiation: "db_negotiation", negotiating: "db_negotiation", contract: "db_negotiation", pending: "db_negotiation",
  won: "db_won", closed_won: "db_won", customer: "db_won", paid: "db_won", active: "db_won",
  lost: "db_lost", closed_lost: "db_lost", dead: "db_lost", churned: "db_lost", disqualified: "db_lost",
};

type Row = Record<string, unknown>;

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
}

export function databaseConfigured(): boolean {
  return Boolean(env("DATA_SOURCE_URL"));
}

function defaultCurrency(): string {
  try {
    return getIndustry(getConfig().industryId).currency;
  } catch {
    return "USD";
  }
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

/** Case/format-insensitive key so "Full Name" matches "full_name". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-.]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function pickValue(row: Row, index: Map<string, string>, mapping: Partial<Record<DataField, string>>, field: DataField): unknown {
  const explicit = mapping[field];
  if (explicit) {
    if (explicit in row) return row[explicit];
    const k = index.get(norm(explicit));
    if (k) return row[k];
  }
  for (const alias of ALIASES[field]) {
    const k = index.get(norm(alias));
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

/** Map an arbitrary status string to one of our pipeline stage ids. */
export function normalizeStageId(v: unknown): string {
  const s = norm(String(v ?? ""));
  return STAGE_MAP[s] ?? STAGE_MAP[s.replace(/_/g, " ")] ?? "db_lead";
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

let idSeq = 0;
function newId(prefix: string): string {
  idSeq = (idSeq + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export class DatabaseProvider implements CrmProvider {
  private url: string;
  private token?: string;
  private mapping: Partial<Record<DataField, string>>;
  private currency: string;
  private cache: { contacts: Contact[]; opportunities: Opportunity[] } | null = null;

  // Local write layer — agent-created records and overrides. Keyed by id so a
  // move/edit of an external row shadows the original on read.
  private createdContacts: Contact[] = [];
  private oppOverrides = new Map<Id, Opportunity>();
  private activities: Activity[] = [];

  constructor() {
    this.url = env("DATA_SOURCE_URL") ?? "";
    this.token = env("DATA_SOURCE_TOKEN");
    this.mapping = readMapping();
    this.currency = defaultCurrency();
  }

  info(): ProviderInfo {
    return {
      id: "database",
      label: "Connected database",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: Boolean(this.url),
      setupHint: "Connect any table — Postgres, Airtable, Sheets, a warehouse view. Set DATA_SOURCE_URL.",
    };
  }

  private async fetchRows(): Promise<Row[]> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.url, { headers });
    if (!res.ok) throw new Error(`data source ${res.status}`);
    return extractRows(await res.json().catch(() => null));
  }

  /** Map external rows → universal model once, then cache. */
  private async loadExternal(): Promise<{ contacts: Contact[]; opportunities: Opportunity[] }> {
    if (this.cache) return this.cache;
    let rows: Row[] = [];
    try {
      rows = await this.fetchRows();
    } catch {
      rows = [];
    }
    const now = new Date().toISOString();
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
      const baseId = rawId ?? email ?? `${norm(name ?? "row")}_${i}`;
      const contactId = `db_${baseId}`;
      const company = str(pickValue(row, index, this.mapping, "company"));

      const points: ContactPoint[] = [];
      if (email) points.push({ channel: "email", value: email });
      if (phone) points.push({ channel: "phone", value: phone });

      contacts.push({
        id: contactId,
        name: name ?? email ?? phone ?? `Lead ${i + 1}`,
        company,
        title: str(pickValue(row, index, this.mapping, "title")),
        points,
        attributes: { source: "database" },
      });

      const valueRaw = pickValue(row, index, this.mapping, "value");
      const stageRaw = pickValue(row, index, this.mapping, "stage");
      if (valueRaw != null || stageRaw != null) {
        opportunities.push({
          id: `dbo_${baseId}`,
          title: company ? `${name ?? email ?? "Lead"} — ${company}` : (name ?? email ?? "Lead"),
          pipelineId: DB_PIPELINE_ID,
          stageId: normalizeStageId(stageRaw),
          value: num(valueRaw),
          currency: this.currency,
          contactId,
          source: "database",
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        });
      }
    });

    this.cache = { contacts, opportunities };
    return this.cache;
  }

  async listUsers(): Promise<User[]> {
    return [];
  }

  async listPipelines(): Promise<Pipeline[]> {
    return [DB_PIPELINE];
  }

  async listContacts(): Promise<Contact[]> {
    const ext = await this.loadExternal();
    return [...ext.contacts, ...this.createdContacts];
  }

  async getContact(id: Id): Promise<Contact | null> {
    const ext = await this.loadExternal();
    return this.createdContacts.find((c) => c.id === id) ?? ext.contacts.find((c) => c.id === id) ?? null;
  }

  async createContact(input: Omit<Contact, "id">): Promise<Contact> {
    const contact: Contact = { ...input, id: newId("dbc") };
    this.createdContacts.unshift(contact);
    return contact;
  }

  async listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]> {
    const ext = await this.loadExternal();
    // Overrides shadow the external row of the same id; pure-local opps append.
    const merged = ext.opportunities.map((o) => this.oppOverrides.get(o.id) ?? o);
    const extIds = new Set(ext.opportunities.map((o) => o.id));
    for (const [id, o] of this.oppOverrides) if (!extIds.has(id)) merged.push(o);
    return merged.filter((o) => this.matches(o, filter));
  }

  private matches(o: Opportunity, f: OpportunityFilter | undefined): boolean {
    if (!f) return true;
    if (f.pipelineId && o.pipelineId !== f.pipelineId) return false;
    if (f.ownerId && o.ownerId !== f.ownerId) return false;
    if (f.stageType) {
      const stage = STAGES.find((s) => s.id === o.stageId);
      if (stage?.type !== f.stageType) return false;
    }
    if (f.staleSince && o.lastActivityAt && o.lastActivityAt > f.staleSince) return false;
    return true;
  }

  async getOpportunity(id: Id): Promise<Opportunity | null> {
    const all = await this.listOpportunities();
    return all.find((o) => o.id === id) ?? null;
  }

  async createOpportunity(input: NewOpportunity): Promise<Opportunity> {
    const now = new Date().toISOString();
    const opp: Opportunity = {
      ...input,
      id: newId("dbo_new"),
      pipelineId: input.pipelineId || DB_PIPELINE_ID,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      tags: [],
    };
    this.oppOverrides.set(opp.id, opp);
    return opp;
  }

  async moveOpportunity(id: Id, stageId: Id): Promise<Opportunity> {
    const current = await this.getOpportunity(id);
    if (!current) throw new Error(`Opportunity ${id} not found`);
    const now = new Date().toISOString();
    const stage = STAGES.find((s) => s.id === stageId);
    const moved: Opportunity = {
      ...current,
      stageId,
      updatedAt: now,
      closedAt: stage?.type === "won" || stage?.type === "lost" ? now : current.closedAt,
    };
    this.oppOverrides.set(id, moved);
    this.activities.push({
      id: newId("dba"),
      opportunityId: id,
      contactId: moved.contactId,
      kind: "stage_change",
      summary: `Moved to ${stage?.label ?? stageId}`,
      occurredAt: now,
    });
    return moved;
  }

  async listActivities(opportunityId: Id): Promise<Activity[]> {
    return this.activities
      .filter((a) => a.opportunityId === opportunityId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }

  async listActivitiesByContact(contactId: Id): Promise<Activity[]> {
    return this.activities
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }

  async listRecentActivities(limit: number): Promise<Activity[]> {
    return this.activities
      .slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, limit);
  }

  async logActivity(input: Omit<Activity, "id">): Promise<Activity> {
    const activity: Activity = { ...input, id: newId("dba") };
    this.activities.push(activity);
    if (input.opportunityId) {
      const opp = await this.getOpportunity(input.opportunityId);
      if (opp) this.oppOverrides.set(opp.id, { ...opp, lastActivityAt: input.occurredAt, updatedAt: input.occurredAt });
    }
    return activity;
  }
}
