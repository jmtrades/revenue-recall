import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { encryptSecret, decryptSecret, encryptionAvailable } from "@/lib/crypto";

/**
 * Per-org connection store. Holds the credentials an org enters to connect their
 * OWN social accounts and data source, with secret values encrypted at rest
 * (see lib/crypto). Dual-mode like the rest of the app: a process-level map for
 * the zero-setup demo, the `connections` table when Supabase is wired.
 *
 * Secrets are returned DECRYPTED from getConnection (server-only callers); the
 * UI-facing list never exposes secret values, only which keys are set.
 */

export type ConnectionKind = "social" | "database" | "crm";

export interface Connection {
  orgId: string;
  kind: ConnectionKind;
  provider: string;
  accountRef?: string;
  /** Decrypted secret values, keyed (e.g. token, appSecret, verifyToken, url). */
  secrets: Record<string, string>;
  /** Non-secret config (label, mapping, version, …). */
  config: Record<string, string>;
  connected: boolean;
}

export interface SaveConnectionInput {
  kind: ConnectionKind;
  provider: string;
  accountRef?: string;
  secrets?: Record<string, string>;
  config?: Record<string, string>;
}

const mem = new Map<string, Connection>(); // key: `${orgId}:${provider}`

/** Test-only: clear the in-memory connections. */
export function __resetConnectionsForTests(): void {
  mem.clear();
}

async function currentOrgId(): Promise<string | null> {
  // With Supabase wired, resolve the real org (session → active org). In the
  // zero-setup demo (no Supabase), the in-memory store is single-tenant, so a
  // stable demo id keeps it functional without an auth context.
  if (!isSupabaseConfigured()) return process.env.DEFAULT_ORG_ID ?? "demo";
  return (await resolveActiveOrgId()) ?? (await getActiveOrgId(getSupabase()!));
}

function encMap(secrets: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(secrets)) if (v) out[k] = encryptSecret(v);
  return out;
}

function decMap(stored: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stored ?? {})) {
    if (typeof v !== "string") continue;
    const dec = decryptSecret(v);
    if (dec !== null) out[k] = dec; // a value that won't decrypt (key rotated) is dropped → treated as unset
  }
  return out;
}

/** Save (upsert) a connection for the current org. Secrets are encrypted. */
export async function saveConnection(input: SaveConnectionInput): Promise<void> {
  if (input.secrets && Object.keys(input.secrets).length > 0 && !encryptionAvailable()) {
    throw new Error("Set ENCRYPTION_KEY to store connection secrets securely.");
  }
  const orgId = await currentOrgId();
  if (!orgId) throw new Error("No active org.");
  const secrets = encMap(input.secrets ?? {});
  const config = input.config ?? {};

  if (!isSupabaseConfigured()) {
    mem.set(`${orgId}:${input.provider}`, {
      orgId,
      kind: input.kind,
      provider: input.provider,
      accountRef: input.accountRef,
      secrets: input.secrets ?? {},
      config,
      connected: true,
    });
    return;
  }
  const { error } = await getSupabase()!
    .from("connections")
    .upsert(
      {
        org_id: orgId,
        kind: input.kind,
        provider: input.provider,
        account_ref: input.accountRef ?? null,
        secrets,
        config,
        connected: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" },
    );
  if (error) throw new Error(error.message);
}

/** Read one connection (decrypted) for the current org, or null. */
export async function getConnection(provider: string): Promise<Connection | null> {
  const orgId = await currentOrgId();
  if (!orgId) return null;
  if (!isSupabaseConfigured()) return mem.get(`${orgId}:${provider}`) ?? null;

  const { data } = await getSupabase()!
    .from("connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return rowToConnection(data as Record<string, unknown>);
}

/** Remove a connection for the current org. */
export async function deleteConnection(provider: string): Promise<void> {
  const orgId = await currentOrgId();
  if (!orgId) return;
  if (!isSupabaseConfigured()) {
    mem.delete(`${orgId}:${provider}`);
    return;
  }
  await getSupabase()!.from("connections").delete().eq("org_id", orgId).eq("provider", provider);
}

/** All connections for the current org (decrypted; for server-side resolution). */
export async function listConnections(): Promise<Connection[]> {
  const orgId = await currentOrgId();
  if (!orgId) return [];
  if (!isSupabaseConfigured()) return [...mem.values()].filter((c) => c.orgId === orgId);
  const { data } = await getSupabase()!.from("connections").select("*").eq("org_id", orgId);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToConnection);
}

/**
 * Webhook routing: find the org that owns a platform account, WITHOUT a session.
 * Uses the service-role client (RLS-bypassing) and matches on (provider,
 * account_ref). Returns the org id, or null when unknown.
 */
export async function findOrgIdByAccount(provider: string, accountRef: string | undefined): Promise<string | null> {
  if (!accountRef) return null;
  if (!isSupabaseConfigured()) {
    const hit = [...mem.values()].find((c) => c.provider === provider && c.accountRef === accountRef);
    return hit?.orgId ?? null;
  }
  const { data } = await getSupabase()!
    .from("connections")
    .select("org_id")
    .eq("provider", provider)
    .eq("account_ref", accountRef)
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

function rowToConnection(r: Record<string, unknown>): Connection {
  return {
    orgId: r.org_id as string,
    kind: r.kind as ConnectionKind,
    provider: r.provider as string,
    accountRef: (r.account_ref as string) ?? undefined,
    secrets: decMap(r.secrets as Record<string, unknown>),
    config: (r.config as Record<string, string>) ?? {},
    connected: Boolean(r.connected),
  };
}
