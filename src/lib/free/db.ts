import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Free database. No account and no host. Node 22+ uses the built-in SQLite
 * driver. Node 20 (what CI runs) has no `node:sqlite`, so the same API falls
 * back to one JSON file. Either way a restart keeps the rows.
 *
 * Off during tests unless FREE_DB=1, and off when a Supabase project is set
 * or FREE_DB=0.
 */

const require = createRequire(import.meta.url);

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

export interface FreeStore {
  writeAnalytics(orgId: string, row: AnalyticsRow): void;
  readAnalytics(orgId: string): AnalyticsRow[];
  writeDoc(orgId: string, kind: string, doc: unknown): void;
  readDoc<T>(orgId: string, kind: string): T | null;
  close(): void;
}

interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

let singleton: FreeStore | null | undefined;
let backend: "postgres" | "sqlite" | "json" | "in-memory" = "in-memory";
let lastDatabaseError = "";
let flushPromise: Promise<void> = Promise.resolve();

/** Wait until queued Postgres writes have been sent. */
export function flushRemoteWrites(): Promise<void> {
  return flushPromise;
}

export function databaseError(): string {
  return lastDatabaseError;
}

/** What is actually serving durable reads and writes. */
export function databaseBackend(): "postgres" | "sqlite" | "json" | "in-memory" {
  if (!freeDbEnabled()) return "in-memory";
  if (backend === "postgres") return "postgres";
  return sqliteAvailable() ? "sqlite" : "json";
}

export interface LocalSnapshot {
  docs: { orgId: string; kind: string; doc: unknown }[];
  analytics: (AnalyticsRow & { orgId: string })[];
}

/** One-time copy of the on-disk SQLite or JSON store, plus builtin CRM files. */
export function readLocalSnapshot(dir: string): LocalSnapshot {
  const docs: LocalSnapshot["docs"] = [];
  const analytics: LocalSnapshot["analytics"] = [];
  const sqliteFile = path.join(dir, "revenue-recall.sqlite");
  const jsonFile = path.join(dir, "revenue-recall.json");
  if (fs.existsSync(sqliteFile) && sqliteAvailable()) {
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (file: string) => SqlDb };
    const db = new DatabaseSync(sqliteFile);
    try {
      const docRows = db.prepare("select org_id, kind, doc from free_docs").all() as { org_id: string; kind: string; doc: string }[];
      for (const row of docRows) {
        try {
          docs.push({ orgId: row.org_id, kind: row.kind, doc: JSON.parse(row.doc) });
        } catch {
          /* skip a corrupt document */
        }
      }
      const events = db.prepare(
        `select org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
                campaign_id, sequence_id, step_id, revenue, cost, actor
         from analytics_events`,
      ).all() as Record<string, unknown>[];
      for (const row of events) analytics.push({ orgId: String(row.org_id), ...mapSqlRow(row) });
    } catch {
      /* a fresh file may not have the tables yet */
    }
    db.close();
  } else if (fs.existsSync(jsonFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as JsonShape;
      for (const row of parsed.docs ?? []) docs.push({ orgId: row.orgId, kind: row.kind, doc: row.doc });
      for (const row of parsed.analytics ?? []) analytics.push(row);
    } catch {
      /* ignore a corrupt json store */
    }
  }
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const match = /^builtin-(.+)\.json$/.exec(name);
      if (!match) continue;
      try {
        docs.push({ orgId: "local", kind: `crm:${match[1]}`, doc: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) });
      } catch {
        /* skip a corrupt CRM file */
      }
    }
  }
  return { docs, analytics };
}

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

function sqliteAvailable(): boolean {
  if (process.env.FREE_STORE === "json") return false;
  try {
    require("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

function openSqlite(file: string): FreeStore {
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
  return {
    writeAnalytics(orgId, row) {
      db.prepare(
        `insert into analytics_events (
          org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
          campaign_id, sequence_id, step_id, revenue, cost, actor
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(org_id, dedupe_key) do nothing`,
      ).run(
        orgId, row.dedupeKey, row.name, row.occurredAt, row.channel ?? null,
        row.contactId ?? null, row.dealId ?? null, row.leadId ?? null,
        row.campaignId ?? null, row.sequenceId ?? null, row.stepId ?? null,
        row.revenue ?? null, row.cost ?? null, row.actor ?? null,
      );
    },
    readAnalytics(orgId) {
      const rows = db.prepare(
        `select dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
                campaign_id, sequence_id, step_id, revenue, cost, actor
         from analytics_events where org_id = ? order by occurred_at asc limit 5000`,
      ).all(orgId) as Array<Record<string, unknown>>;
      return rows.map(mapSqlRow);
    },
    writeDoc(orgId, kind, doc) {
      db.prepare(
        `insert into free_docs (org_id, kind, doc) values (?, ?, ?)
         on conflict(org_id, kind) do update set doc = excluded.doc`,
      ).run(orgId, kind, JSON.stringify(doc));
    },
    readDoc(orgId, kind) {
      const row = db.prepare(`select doc from free_docs where org_id = ? and kind = ?`).get(orgId, kind) as { doc: string } | undefined;
      if (!row) return null;
      try {
        return JSON.parse(row.doc) as never;
      } catch {
        return null;
      }
    },
    close() {
      db.close();
    },
  };
}

function mapSqlRow(r: Record<string, unknown>): AnalyticsRow {
  return {
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
  };
}

interface JsonShape {
  analytics: Array<AnalyticsRow & { orgId: string }>;
  docs: Array<{ orgId: string; kind: string; doc: unknown }>;
}

function openJson(file: string): FreeStore {
  const jsonFile = file.endsWith(".sqlite") ? file.replace(/\.sqlite$/, ".json") : `${file}.json`;
  const load = (): JsonShape => {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as JsonShape;
      return { analytics: parsed.analytics ?? [], docs: parsed.docs ?? [] };
    } catch {
      return { analytics: [], docs: [] };
    }
  };
  const save = (data: JsonShape) => {
    fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
    const tmp = `${jsonFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, jsonFile);
  };
  return {
    writeAnalytics(orgId, row) {
      const data = load();
      if (data.analytics.some((a) => a.orgId === orgId && a.dedupeKey === row.dedupeKey)) return;
      data.analytics.push({ ...row, orgId });
      save(data);
    },
    readAnalytics(orgId) {
      return load().analytics.filter((a) => a.orgId === orgId).slice(0, 5000);
    },
    writeDoc(orgId, kind, doc) {
      const data = load();
      const next = data.docs.filter((d) => !(d.orgId === orgId && d.kind === kind));
      next.push({ orgId, kind, doc });
      data.docs = next;
      save(data);
    },
    readDoc(orgId, kind) {
      const found = load().docs.find((d) => d.orgId === orgId && d.kind === kind);
      return (found?.doc as never) ?? null;
    },
    close() {
      /* the file is already flushed */
    },
  };
}

/** Opens the free store for a path. SQLite when this Node has it, JSON otherwise. */
export function openFreeStore(file: string): FreeStore {
  return sqliteAvailable() ? openSqlite(file) : openJson(file);
}

/**
 * When DATABASE_URL is set, the file store is a cache in front of Postgres.
 * Render's free disk is wiped on restart. The database is not.
 * Writes update memory immediately and commit in order on the connection.
 */
export async function hydrateRemoteStore(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !freeDbEnabled()) return;
  if (backend === "postgres") return;
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 8000,
    ssl: url.includes("render.com") || url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
  } catch (first) {
    await client.end().catch(() => undefined);
    const retry = new Client({ connectionString: url, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } });
    try {
      await retry.connect();
      return finishHydrate(retry);
    } catch (second) {
      await retry.end().catch(() => undefined);
      lastDatabaseError = [first, second].map((err) => (err instanceof Error ? err.message : "connect failed")).join(" | ").replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://***");
      throw second;
    }
  }
  return finishHydrate(client);
}

async function finishHydrate(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> }): Promise<void> {
  await client.query(`
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
      revenue double precision,
      cost double precision,
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
  const have = new Set(
    (await client.query("select org_id, kind from free_docs")).rows.map((r) => `${r.org_id}\0${r.kind}`),
  );
  const snap = readLocalSnapshot(path.dirname(freeDbPath()));
  for (const doc of snap.docs) {
    const key = `${doc.orgId}\0${doc.kind}`;
    if (have.has(key)) continue;
    await client.query(
      `insert into free_docs (org_id, kind, doc) values ($1, $2, $3) on conflict (org_id, kind) do nothing`,
      [doc.orgId, doc.kind, JSON.stringify(doc.doc)],
    );
    have.add(key);
  }
  const eventCount = await client.query("select count(*)::int as n from analytics_events");
  if (Number(eventCount.rows[0]?.n ?? 0) === 0) {
    for (const row of snap.analytics) {
      await client.query(
        `insert into analytics_events (
          org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
          campaign_id, sequence_id, step_id, revenue, cost, actor
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (org_id, dedupe_key) do nothing`,
        [row.orgId, row.dedupeKey, row.name, row.occurredAt, row.channel ?? null, row.contactId ?? null, row.dealId ?? null, row.leadId ?? null, row.campaignId ?? null, row.sequenceId ?? null, row.stepId ?? null, row.revenue ?? null, row.cost ?? null, row.actor ?? null],
      );
    }
  }
  const docs = await client.query("select org_id, kind, doc from free_docs");
  const analytics = await client.query(
    "select org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id, campaign_id, sequence_id, step_id, revenue, cost, actor from analytics_events order by occurred_at asc limit 20000",
  );
  let chain = Promise.resolve();
  const enqueue = (sql: string, params: unknown[]) => {
    chain = chain.then(() => client.query(sql, params)).then(() => undefined).catch((err: unknown) => {
      lastDatabaseError = (err instanceof Error ? err.message : "write failed").replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://***");
    });
    flushPromise = chain;
  };
  const docRows = new Map<string, unknown>();
  for (const row of docs.rows) {
    try {
      docRows.set(`${row.org_id}\0${row.kind}`, JSON.parse(String(row.doc)));
    } catch {
      /* skip a corrupt document */
    }
  }
  const events = analytics.rows.map((r) => ({ orgId: String(r.org_id), ...mapSqlRow(r) }));
  singleton = {
    writeAnalytics(orgId, row) {
      if (events.some((a) => a.orgId === orgId && a.dedupeKey === row.dedupeKey)) return;
      events.push({ ...row, orgId });
      enqueue(
        `insert into analytics_events (
          org_id, dedupe_key, name, occurred_at, channel, contact_id, deal_id, lead_id,
          campaign_id, sequence_id, step_id, revenue, cost, actor
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (org_id, dedupe_key) do nothing`,
        [orgId, row.dedupeKey, row.name, row.occurredAt, row.channel ?? null, row.contactId ?? null, row.dealId ?? null, row.leadId ?? null, row.campaignId ?? null, row.sequenceId ?? null, row.stepId ?? null, row.revenue ?? null, row.cost ?? null, row.actor ?? null],
      );
    },
    readAnalytics(orgId) {
      return events.filter((a) => a.orgId === orgId).slice(0, 5000);
    },
    writeDoc(orgId, kind, doc) {
      docRows.set(`${orgId}\0${kind}`, doc);
      enqueue(
        `insert into free_docs (org_id, kind, doc) values ($1, $2, $3)
         on conflict (org_id, kind) do update set doc = excluded.doc`,
        [orgId, kind, JSON.stringify(doc)],
      );
    },
    readDoc(orgId, kind) {
      return (docRows.get(`${orgId}\0${kind}`) as never) ?? null;
    },
    close() {
      void client.end();
    },
  };
  backend = "postgres";
}

/** The process database, or null when the free file store is off. */
export function getFreeDb(): FreeStore | null {
  if (!freeDbEnabled()) return null;
  if (singleton !== undefined) return singleton;
  // Opening the file while DATABASE_URL is set would fork writes away from Postgres.
  if (process.env.DATABASE_URL) return null;
  try {
    singleton = openFreeStore(freeDbPath());
    backend = sqliteAvailable() ? "sqlite" : "json";
  } catch {
    singleton = null;
  }
  return singleton;
}

/** Test-only: drop the cached handle so the next open hits a new file. */
export function __closeFreeDbForTests(): void {
  try {
    singleton?.close();
  } catch {
    /* already closed */
  }
  singleton = undefined;
  backend = "in-memory";
}
