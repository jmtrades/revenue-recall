import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getFreeDb, readDoc, writeDoc } from "@/lib/free/db";
import { phoneDigits, phonesMatch, normalizeEmail } from "@/lib/webinar/time";
import type { WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";

/**
 * Webinar store. SQLite file when no Supabase is configured (the free host).
 * Pure memory in tests. Org-scoped Supabase tables when that project is set.
 * Writes are compare-and-swap on `version` so two workers can't both dial
 * the same leave.
 */

interface Mem {
  events: Set<string>;
  sessions: Map<string, WebinarSession & { provider: string }>;
  registrants: Map<string, WebinarRegistrant>;
}

const memory = new Map<string, Mem>();

interface SavedBag {
  events: string[];
  sessions: [string, WebinarSession & { provider: string }][];
  registrants: [string, WebinarRegistrant][];
}

function bag(orgId: string): Mem {
  let b = memory.get(orgId);
  if (!b) {
    const file = getFreeDb();
    const saved = file ? readDoc<SavedBag>(file, orgId, "webinar") : null;
    b = saved
      ? { events: new Set(saved.events), sessions: new Map(saved.sessions), registrants: new Map(saved.registrants) }
      : { events: new Set(), sessions: new Map(), registrants: new Map() };
    memory.set(orgId, b);
  }
  return b;
}

function remember(orgId: string): void {
  const file = getFreeDb();
  const b = memory.get(orgId);
  if (!file || !b) return;
  const doc: SavedBag = {
    events: [...b.events],
    sessions: [...b.sessions.entries()],
    registrants: [...b.registrants.entries()],
  };
  writeDoc(file, orgId, "webinar", doc);
}

export function __resetWebinarForTests(): void {
  memory.clear();
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function nextDue(reg: WebinarRegistrant): string | null {
  const pending = reg.actions.filter((a) => a.status === "pending").map((a) => a.dueAt).sort();
  return pending[0] ?? null;
}

function dbConfigured(): boolean {
  return isSupabaseConfigured();
}

export async function claimEvent(orgId: string, key: string): Promise<boolean> {
  if (!dbConfigured()) {
    const b = bag(orgId);
    const id = `${orgId}:${key}`;
    if (b.events.has(id)) return false;
    b.events.add(id);
    remember(orgId);
    return true;
  }
  const { error } = await getSupabase()!.from("webinar_events").insert({ org_id: orgId, dedupe_key: key });
  if (!error) return true;
  if (error.code === "23505" || /duplicate/i.test(error.message)) return false;
  throw new Error(error.message);
}

export async function forgetEvent(orgId: string, key: string): Promise<void> {
  if (!dbConfigured()) {
    bag(orgId).events.delete(`${orgId}:${key}`);
    remember(orgId);
    return;
  }
  await getSupabase()!.from("webinar_events").delete().eq("org_id", orgId).eq("dedupe_key", key);
}

export async function upsertSession(orgId: string, patch: Partial<WebinarSession> & { id: string }, provider: string): Promise<WebinarSession> {
  const current = (await getSession(orgId, patch.id)) ?? {
    id: patch.id,
    provider,
    title: patch.title ?? "Webinar",
    phase: patch.phase ?? "scheduled",
  };
  const next: WebinarSession = {
    ...current,
    ...stripUndefined(patch),
    id: patch.id,
    provider: current.provider || provider,
    title: patch.title ?? current.title,
    phase: patch.phase ?? current.phase,
  };
  if (!dbConfigured()) {
    bag(orgId).sessions.set(patch.id, { ...next, provider: next.provider });
    remember(orgId);
    return next;
  }
  const { error } = await getSupabase()!.from("webinar_sessions").upsert({
    org_id: orgId,
    id: next.id,
    provider: next.provider,
    title: next.title,
    phase: next.phase,
    timezone: next.timezone ?? null,
    starts_at: next.startsAt ?? null,
    ends_at: next.endsAt ?? null,
    offer_at: next.offerAt ?? null,
    rejoin_url: next.rejoinUrl ?? null,
    replay_url: next.replayUrl ?? null,
  });
  if (error) throw new Error(error.message);
  return next;
}

function stripUndefined<T extends object>(v: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined) (out as Record<string, unknown>)[k] = val;
  }
  return out;
}

export async function getSession(orgId: string, id: string): Promise<WebinarSession | null> {
  if (!dbConfigured()) return bag(orgId).sessions.get(id) ?? null;
  const { data, error } = await getSupabase()!.from("webinar_sessions").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    provider: String(r.provider ?? "generic"),
    title: String(r.title ?? "Webinar"),
    phase: (r.phase as WebinarSession["phase"]) ?? "scheduled",
    timezone: (r.timezone as string) ?? undefined,
    startsAt: (r.starts_at as string) ?? undefined,
    endsAt: (r.ends_at as string) ?? undefined,
    offerAt: (r.offer_at as string) ?? undefined,
    rejoinUrl: (r.rejoin_url as string) ?? undefined,
    replayUrl: (r.replay_url as string) ?? undefined,
  };
}

export async function getRegistrant(orgId: string, id: string): Promise<WebinarRegistrant | null> {
  if (!dbConfigured()) {
    const row = bag(orgId).registrants.get(id);
    return row ? clone(row) : null;
  }
  const { data, error } = await getSupabase()!.from("webinar_registrants").select("data").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return clone((data as { data: WebinarRegistrant }).data);
}

/** Save only if `expectedVersion` is still current. Returns false on a lost race. */
export async function saveRegistrant(orgId: string, reg: WebinarRegistrant, expectedVersion: number): Promise<boolean> {
  const next = clone(reg);
  next.version = expectedVersion + 1;
  if (!dbConfigured()) {
    const b = bag(orgId);
    const cur = b.registrants.get(reg.id);
    if ((cur?.version ?? 0) !== expectedVersion) return false;
    b.registrants.set(reg.id, next);
    reg.version = next.version;
    remember(orgId);
    return true;
  }
  const row = {
    org_id: orgId,
    id: next.id,
    session_id: next.sessionId,
    email: normalizeEmail(next.email) ?? null,
    phone: phoneDigits(next.phone) || null,
    state: next.state,
    next_due_at: nextDue(next),
    version: next.version,
    data: next,
    updated_at: new Date().toISOString(),
  };
  if (expectedVersion === 0) {
    const { error } = await getSupabase()!.from("webinar_registrants").insert(row);
    if (!error) {
      reg.version = next.version;
      return true;
    }
    if (error.code !== "23505" && !/duplicate/i.test(error.message)) throw new Error(error.message);
    return false;
  }
  const { data, error } = await getSupabase()!
    .from("webinar_registrants")
    .update(row)
    .eq("org_id", orgId)
    .eq("id", next.id)
    .eq("version", expectedVersion)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;
  reg.version = next.version;
  return true;
}

export async function findRegistrant(
  orgId: string,
  sessionId: string,
  hint: { id?: string; email?: string; phone?: string; providerRegistrantId?: string },
): Promise<WebinarRegistrant | null> {
  const rows = await listSession(orgId, sessionId);
  const email = normalizeEmail(hint.email);
  return (
    rows.find((r) => Boolean(hint.id) && (r.id === hint.id || r.providerRegistrantId === hint.id)) ??
    rows.find((r) => Boolean(hint.providerRegistrantId) && r.providerRegistrantId === hint.providerRegistrantId) ??
    rows.find((r) => Boolean(email) && normalizeEmail(r.email) === email) ??
    rows.find((r) => Boolean(hint.phone) && phonesMatch(r.phone, hint.phone)) ??
    null
  );
}

export async function listSession(orgId: string, sessionId: string): Promise<WebinarRegistrant[]> {
  if (!dbConfigured()) return [...bag(orgId).registrants.values()].filter((r) => r.sessionId === sessionId).map(clone);
  const { data, error } = await getSupabase()!.from("webinar_registrants").select("data").eq("org_id", orgId).eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => clone((r as { data: WebinarRegistrant }).data));
}

export async function listByIdentity(orgId: string, email?: string, phone?: string): Promise<WebinarRegistrant[]> {
  const e = normalizeEmail(email);
  const digits = phoneDigits(phone);
  if (!dbConfigured()) {
    return [...bag(orgId).registrants.values()]
      .filter((r) => (e && normalizeEmail(r.email) === e) || (digits && phonesMatch(r.phone, digits)))
      .map(clone);
  }
  const client = getSupabase()!;
  const rows: WebinarRegistrant[] = [];
  if (e) {
    const { data, error } = await client.from("webinar_registrants").select("data").eq("org_id", orgId).eq("email", e);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []).map((r) => (r as { data: WebinarRegistrant }).data));
  }
  if (digits.length >= 10) {
    const { data, error } = await client.from("webinar_registrants").select("data").eq("org_id", orgId).ilike("phone", `%${digits.slice(-10)}`);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const reg = (r as { data: WebinarRegistrant }).data;
      if (!rows.some((x) => x.id === reg.id)) rows.push(reg);
    }
  }
  return rows.map(clone);
}

export async function listDue(orgId: string, now: Date): Promise<WebinarRegistrant[]> {
  const iso = now.toISOString();
  if (!dbConfigured()) {
    return [...bag(orgId).registrants.values()]
      .filter((r) => r.actions.some((a) => a.status === "pending" && a.dueAt <= iso))
      .map(clone);
  }
  const { data, error } = await getSupabase()!
    .from("webinar_registrants")
    .select("data")
    .eq("org_id", orgId)
    .not("next_due_at", "is", null)
    .lte("next_due_at", iso)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => clone((r as { data: WebinarRegistrant }).data));
}

export async function webinarCounts(orgId: string): Promise<{ byState: Record<string, number>; pending: number; sessions: number }> {
  const regs = !dbConfigured()
    ? [...bag(orgId).registrants.values()]
    : await (async () => {
        const { data, error } = await getSupabase()!.from("webinar_registrants").select("state,next_due_at").eq("org_id", orgId);
        if (error) throw new Error(error.message);
        return (data ?? []) as { state: string; next_due_at: string | null }[];
      })();
  const byState: Record<string, number> = {};
  let pending = 0;
  if (!dbConfigured()) {
    for (const r of regs as WebinarRegistrant[]) {
      byState[r.state] = (byState[r.state] ?? 0) + 1;
      if (r.actions.some((a) => a.status === "pending")) pending += 1;
    }
    return { byState, pending, sessions: bag(orgId).sessions.size };
  }
  for (const r of regs as { state: string; next_due_at: string | null }[]) {
    byState[r.state] = (byState[r.state] ?? 0) + 1;
    if (r.next_due_at) pending += 1;
  }
  const { count, error } = await getSupabase()!.from("webinar_sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return { byState, pending, sessions: count ?? 0 };
}
