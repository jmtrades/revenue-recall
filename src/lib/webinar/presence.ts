import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { CanonicalEvent } from "@/lib/webinar/types";
import { hashKey } from "@/lib/webinar/outcomes";

/**
 * Presence for platforms that cannot push a leave. The snippet heartbeats while
 * the page is open and sends leave on pagehide. A missed heartbeat (tab crash,
 * killed mobile browser) is the backup: the minute tick, or an in-request sweep,
 * turns silence into a leave.
 */

export interface BeaconBody {
  type?: string;
  sessionId?: string;
  email?: string;
  phone?: string;
  name?: string;
  provider?: string;
  consent?: { call?: boolean; sms?: boolean };
}

interface PresenceRow {
  key: string;
  sessionId: string;
  provider: string;
  email?: string;
  phone?: string;
  name?: string;
  consentCall: boolean;
  consentSms: boolean;
  present: boolean;
  lastSeen: number;
  joins: number;
}

const memory = new Map<string, Map<string, PresenceRow>>();

export function __resetPresenceForTests(): void {
  memory.clear();
}

export function beaconGraceMs(): number {
  const n = Number(process.env.WEBINAR_BEACON_GRACE_MS);
  return Number.isFinite(n) && n >= 3_000 ? n : 12_000;
}

function bag(orgId: string): Map<string, PresenceRow> {
  let b = memory.get(orgId);
  if (!b) {
    b = new Map();
    memory.set(orgId, b);
  }
  return b;
}

function rowKey(sessionId: string, email?: string, phone?: string): string {
  const who = (email ?? "").trim().toLowerCase() || (phone ?? "").replace(/\D/g, "");
  return `${sessionId}:${who}`;
}

function toEvent(row: PresenceRow, type: "attendance.joined" | "attendance.left", now: Date): CanonicalEvent {
  const occurredAt = now.toISOString();
  const who = row.email ?? row.phone ?? "anon";
  const stamp = type === "attendance.joined" ? String(row.joins) : String(Math.floor(now.getTime() / 1000));
  return {
    dedupeKey: `${row.provider}:beacon:${type}:${hashKey([row.key, stamp])}`,
    provider: row.provider,
    type,
    occurredAt,
    session: { id: row.sessionId, phase: "live", title: "Webinar" },
    registrant: {
      email: row.email,
      phone: row.phone,
      name: row.name,
      consent: { call: row.consentCall, sms: row.consentSms },
    },
  };
}

/** Record a beacon hit and return the lifecycle event it implies, if any. */
export function recordBeacon(orgId: string, body: BeaconBody, now = new Date()): CanonicalEvent | null {
  const sessionId = body.sessionId?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();
  if (!sessionId || (!email && !phone)) return null;
  const key = rowKey(sessionId, email, phone);
  const rows = bag(orgId);
  const existing = rows.get(key);
  const kind = (body.type ?? "heartbeat").toLowerCase();
  const row: PresenceRow = existing ?? {
    key,
    sessionId,
    provider: (body.provider ?? "beacon").toLowerCase(),
    email,
    phone,
    name: body.name?.trim(),
    consentCall: Boolean(body.consent?.call),
    consentSms: Boolean(body.consent?.sms),
    present: false,
    lastSeen: now.getTime(),
    joins: 0,
  };
  if (body.consent?.call) row.consentCall = true;
  if (body.consent?.sms) row.consentSms = true;
  if (body.name) row.name = body.name.trim();
  if (kind === "leave") {
    const was = row.present || !existing;
    row.present = false;
    row.lastSeen = now.getTime();
    rows.set(key, row);
    void persist(orgId, row);
    return was ? toEvent(row, "attendance.left", now) : null;
  }
  const becamePresent = !row.present;
  if (becamePresent) row.joins += 1;
  row.present = true;
  row.lastSeen = now.getTime();
  rows.set(key, row);
  void persist(orgId, row);
  return becamePresent ? toEvent(row, "attendance.joined", now) : null;
}

/** Leaves for people whose heartbeat went quiet. */
export function sweepPresence(orgId: string, now = new Date(), graceMs = beaconGraceMs()): CanonicalEvent[] {
  const rows = bag(orgId);
  const out: CanonicalEvent[] = [];
  for (const row of rows.values()) {
    if (!row.present) continue;
    if (now.getTime() - row.lastSeen <= graceMs) continue;
    row.present = false;
    void persist(orgId, row);
    out.push(toEvent(row, "attendance.left", now));
  }
  return out;
}

async function persist(orgId: string, row: PresenceRow): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabase();
  if (!client) return;
  await client.from("webinar_presence").upsert({
    org_id: orgId,
    presence_key: row.key,
    session_id: row.sessionId,
    provider: row.provider,
    email: row.email ?? null,
    phone: row.phone ?? null,
    name: row.name ?? null,
    present: row.present,
    last_seen: new Date(row.lastSeen).toISOString(),
  });
}

/** The snippet hosts paste on a page they control. It does not run inside Zoom, YouTube, or StreamYard. */
export function beaconScript(): string {
  return `(function(){
  var cfg = window.RR_WEBINAR || {};
  if (!cfg.endpoint || !cfg.sessionId) return;
  var hiddenTimer = null;
  function send(type){
    var body = JSON.stringify({
      type: type,
      sessionId: cfg.sessionId,
      email: cfg.email || "",
      phone: cfg.phone || "",
      name: cfg.name || "",
      provider: cfg.provider || "beacon",
      consent: cfg.consent || {}
    });
    if (type === "leave" && navigator.sendBeacon) {
      navigator.sendBeacon(cfg.endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(cfg.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true }).catch(function(){});
  }
  send("join");
  setInterval(function(){ if (document.visibilityState !== "hidden") send("heartbeat"); }, cfg.intervalMs || 5000);
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "hidden") {
      hiddenTimer = setTimeout(function(){ send("leave"); }, cfg.hiddenMs || 8000);
    } else {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      send("join");
    }
  });
  window.addEventListener("pagehide", function(){ send("leave"); });
  window.addEventListener("beforeunload", function(){ send("leave"); });
})();`;
}
