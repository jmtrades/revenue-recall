import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/lib/api-keys";

/**
 * Server-side API-key storage. Keys live (hashed) on the org row, one per
 * workspace. The plaintext is returned exactly once at rotation time and never
 * again — only its hash is persisted.
 */

export interface ApiKeyInfo {
  present: boolean;
  prefix: string | null;
}

export async function getApiKeyInfo(): Promise<ApiKeyInfo> {
  const client = getSupabase();
  if (!client) return { present: false, prefix: null };
  const orgId = await resolveActiveOrgId();
  if (!orgId) return { present: false, prefix: null };
  const { data } = await client.from("orgs").select("api_key_hash,api_key_prefix").eq("id", orgId).maybeSingle();
  return { present: Boolean(data?.api_key_hash), prefix: (data?.api_key_prefix as string) ?? null };
}

/** Generate + persist a new key (replacing any existing one); return plaintext ONCE. */
export async function rotateApiKey(): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error("API keys require a connected database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { key, hash, prefix } = generateApiKey();
  const { error } = await client.from("orgs").update({ api_key_hash: hash, api_key_prefix: prefix }).eq("id", orgId);
  if (error) throw new Error(error.message);
  return key;
}

export async function revokeApiKey(): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("API keys require a connected database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { error } = await client.from("orgs").update({ api_key_hash: null, api_key_prefix: null }).eq("id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * Resolve the org that owns a presented API key — the auth for the public
 * /api/v1 endpoints. Returns the org id, or null when the key is malformed,
 * unknown, or there's no database. A direct indexed lookup by the key's hash.
 */
export async function resolveOrgByApiKey(key: string | null | undefined): Promise<string | null> {
  if (!looksLikeApiKey(key)) return null;
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.from("orgs").select("id").eq("api_key_hash", hashApiKey(key)).maybeSingle();
  return (data?.id as string) ?? null;
}
