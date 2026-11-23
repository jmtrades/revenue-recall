import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

/**
 * Free database. A SQLite file on disk (Node's built-in driver, no account,
 * no host). Used whenever Supabase is not configured and this is not a test
 * run. Set FREE_DB=0 to force the in-memory demo instead.
 */

const require = createRequire(import.meta.url);

let singleton: SqlDb | null | undefined;

export function freeDbEnabled(): boolean {
  if (process.env.FREE_DB === "0") return false;
  if (process.env.VITEST === "true" && process.env.FREE_DB !== "1") return false;
  if (isSupabaseConfigured()) return false;
  return true;
}

export function freeDbPath(): string {
  const dir = process.env.FREE_DB_DIR || path.join(process.cwd(), ".data");
  return path.join(dir, "revenue-recall.sqlite");
}

export function openSqlite(file: string): SqlDb {
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (file: string) => SqlDb };
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    create table if not exists analytics_events (
      org_id text not null,
      dedupe_key text not null,
      name text not null,
      occurred_at text not null,
      channel text,
      contact_id text,
      deal_id text,
      lead_id text,
      campaign_id text,
      sequence_id text,
      step_id text,
      revenue real,
      cost real,
      actor text,
      primary key (org_id, dedupe_key)
    );
    create table if not exists free_docs (
      org_id text not null,
      kind text not null,
      doc text not null,
      primary key (org_id, kind)
    );
  `);
  return db;
}

/** The process database, or null when the free file store is off. */
export function getFreeDb(): SqlDb | null {
  if (!freeDbEnabled()) return null;
  if (singleton !== undefined) return singleton;
  try {
    singleton = openSqlite(freeDbPath());
  } catch {
    singleton = null;
  }
  return singleton;
}

export function writeDoc(db: SqlDb, orgId: string, kind: string, doc: unknown): void {
  db.prepare(
    `insert into free_docs (org_id, kind, doc) values (?, ?, ?)
     on conflict(org_id, kind) do update set doc = excluded.doc`,
  ).run(orgId, kind, JSON.stringify(doc));
}

export function readDoc<T>(db: SqlDb, orgId: string, kind: string): T | null {
  const row = db.prepare(`select doc from free_docs where org_id = ? and kind = ?`).get(orgId, kind) as { doc: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.doc) as T;
  } catch {
    return null;
  }
}

export interface AnalyticsRow {
  dedupeKey: string;
  name: string;
  occurredAt: string;
  channel?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  sequenceId?: string | null;
  stepId?: string | null;
  revenue?: number | null;
  cost?: number | null;
  actor?: string | null;
}

export function writeAnalytics(db: SqlDb, orgId: string, row: AnalyticsRow): void {
  db.prepare(
    `insert into analytics_events (
      org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
      campaign_id, sequence_id, step_id, revenue, cost, actor
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(org_id, dedupe_key) do nothing`,
  ).run(
    orgId,
    row.dedupeKey,
    row.name,
    row.occurredAt,
    row.channel ?? null,
    row.contactId ?? null,
    row.dealId ?? null,
    row.leadId ?? null,
    row.campaignId ?? null,
    row.sequenceId ?? null,
    row.stepId ?? null,
    row.revenue ?? null,
    row.cost ?? null,
    row.actor ?? null,
  );
}

export function readAnalytics(db: SqlDb, orgId: string): AnalyticsRow[] {
  const rows = db.prepare(
    `select dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
            campaign_id, sequence_id, step_id, revenue, cost, actor
     from analytics_events where org_id = ? order by occurred_at asc limit 5000`,
  ).all(orgId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    dedupeKey: String(r.dedupe_key),
    name: String(r.name),
    occurredAt: String(r.occurred_at),
    channel: (r.channel as string) ?? null,
    contactId: (r.contact_id as string) ?? null,
    dealId: (r.deal_id as string) ?? null,
    leadId: (r.lead_id as string) ?? null,
    campaignId: (r.campaign_id as string) ?? null,
    sequenceId: (r.sequence_id as string) ?? null,
    stepId: (r.step_id as string) ?? null,
    revenue: r.revenue == null ? null : Number(r.revenue),
    cost: r.cost == null ? null : Number(r.cost),
    actor: (r.actor as string) ?? null,
  }));
}

/** Test-only: drop the cached handle so the next open hits a new file. */
export function __closeFreeDbForTests(): void {
  try {
    singleton?.close();
  } catch {
    /* already closed */
  }
  singleton = undefined;
}
