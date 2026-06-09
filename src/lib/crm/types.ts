/**
 * Universal CRM domain model.
 *
 * Every supported backend — the built-in store, Close, HubSpot, Salesforce,
 * Pipedrive, a spreadsheet, or nothing at all — is normalized into these
 * shapes so the rest of the app never needs to know which CRM is behind it.
 */

export type Id = string;
export type IsoDate = string;

export type ContactChannel = "email" | "phone" | "sms" | "whatsapp" | "linkedin";

export interface ContactPoint {
  channel: ContactChannel;
  value: string;
  label?: string;
}

export interface Contact {
  id: Id;
  name: string;
  company?: string;
  title?: string;
  points: ContactPoint[];
  /** Free-form, industry-specific attributes (e.g. budget, propertyType). */
  attributes?: Record<string, string | number | boolean | null>;
}

/** A pipeline stage. `won`/`lost` mark terminal outcomes. */
export interface Stage {
  id: Id;
  label: string;
  /** 0..1 default probability of closing at this stage. */
  probability: number;
  type: "open" | "won" | "lost";
}

export interface Pipeline {
  id: Id;
  label: string;
  stages: Stage[];
}

export interface Opportunity {
  id: Id;
  title: string;
  pipelineId: Id;
  stageId: Id;
  /** Monetary value in minor units is avoided; we use a plain number + currency. */
  value: number;
  currency: string;
  contactId: Id;
  ownerId?: Id;
  source?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  /** Last meaningful touch (call/email/meeting/note). Drives the recall engine. */
  lastActivityAt?: IsoDate;
  expectedCloseAt?: IsoDate;
  closedAt?: IsoDate;
  lossReason?: string;
  tags?: string[];
}

export type ActivityKind =
  | "call"
  | "email"
  | "sms"
  | "meeting"
  | "note"
  | "task"
  | "stage_change";

export interface Activity {
  id: Id;
  opportunityId?: Id;
  contactId?: Id;
  kind: ActivityKind;
  summary: string;
  occurredAt: IsoDate;
  direction?: "inbound" | "outbound";
  ownerId?: Id;
}

export interface User {
  id: Id;
  name: string;
  email?: string;
}

/** Capabilities a provider may or may not support, so the UI can adapt. */
export interface ProviderCapabilities {
  read: boolean;
  write: boolean;
  activities: boolean;
  customFields: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  capabilities: ProviderCapabilities;
  /** Whether this provider is fully configured and usable right now. */
  ready: boolean;
  /**
   * Optional one-line guidance shown when a provider isn't connected yet — e.g.
   * which env var to set. Mainly for the bring-your-own connectors (database,
   * HTTP CRM) so users know how to plug in their own data.
   */
  setupHint?: string;
}

export interface NewOpportunity {
  title: string;
  pipelineId: Id;
  stageId: Id;
  value: number;
  currency: string;
  contactId: Id;
  ownerId?: Id;
  source?: string;
  expectedCloseAt?: IsoDate;
}

export interface OpportunityFilter {
  pipelineId?: Id;
  stageType?: Stage["type"];
  ownerId?: Id;
  /** Only opportunities with no activity since this date. */
  staleSince?: IsoDate;
}

/**
 * The single interface every CRM backend implements. Keep it small and
 * outcome-oriented; richer behavior lives in the domain layer above it.
 */
export interface CrmProvider {
  info(): ProviderInfo;

  listUsers(): Promise<User[]>;
  listPipelines(): Promise<Pipeline[]>;

  listContacts(): Promise<Contact[]>;
  getContact(id: Id): Promise<Contact | null>;
  createContact(input: Omit<Contact, "id">): Promise<Contact>;
  /**
   * Optional: patch a contact (e.g. set an email-bounce suppression flag in
   * attributes). Providers that can't write contacts omit it; callers degrade
   * gracefully (bounce suppression simply no-ops on read-only / external CRMs).
   */
  updateContact?(id: Id, patch: Partial<Omit<Contact, "id">>): Promise<Contact>;
  /** Optional: permanently delete a contact (junk/duplicate removal). */
  deleteContact?(id: Id): Promise<void>;

  listOpportunities(filter?: OpportunityFilter): Promise<Opportunity[]>;
  getOpportunity(id: Id): Promise<Opportunity | null>;
  createOpportunity(input: NewOpportunity): Promise<Opportunity>;
  moveOpportunity(id: Id, stageId: Id): Promise<Opportunity>;
  /**
   * Optional: edit a deal's core fields (title / value / expected close /
   * owner — an empty-string ownerId unassigns). Stage changes go through
   * moveOpportunity; currency is workspace-fixed and never edited here.
   * Read-only / external CRMs omit it.
   */
  updateOpportunity?(id: Id, patch: Partial<Pick<Opportunity, "title" | "value" | "expectedCloseAt" | "ownerId">>): Promise<Opportunity>;
  /** Optional: permanently delete a deal (junk/duplicate removal). */
  deleteOpportunity?(id: Id): Promise<void>;

  listActivities(opportunityId: Id): Promise<Activity[]>;
  /** Most recent activities across the whole org, newest first. */
  listRecentActivities(limit: number): Promise<Activity[]>;
  /**
   * Optional batch fetch: activities for many opportunities at once, keyed by
   * opportunity id. Providers that can do this in one query (Supabase, built-in)
   * implement it to avoid N+1 in the agent/cadence loops; callers use the
   * `batchActivities` helper, which falls back to per-id fetches when absent.
   */
  listActivitiesByOpps?(opportunityIds: Id[]): Promise<Record<Id, Activity[]>>;
  /**
   * Optional: every activity logged against a contact directly (not via a deal).
   * The unified inbox uses this to surface conversations from people who have no
   * open opportunity yet — e.g. inbound social DMs. Providers that can't query
   * by contact omit it; the inbox falls back to deal-scoped activity.
   */
  listActivitiesByContact?(contactId: Id): Promise<Activity[]>;
  logActivity(input: Omit<Activity, "id">): Promise<Activity>;
}
