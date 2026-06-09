import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the active org id for the current request.
 *
 * Resolution order:
 *  1. DEFAULT_ORG_ID env (single-tenant deployments / explicit pin)
 *  2. The org linked to the signed-in auth user (multi-tenant, once auth is wired)
 *  3. The first org row (single-org fallback)
 *
 * Returns null when the database has no org yet (run bootstrap).
 */
export async function getActiveOrgId(client: SupabaseClient, authUserId?: string): Promise<string | null> {
  if (process.env.DEFAULT_ORG_ID) return process.env.DEFAULT_ORG_ID;

  if (authUserId) {
    const { data } = await client.from("members").select("org_id").eq("auth_user_id", authUserId).limit(1).maybeSingle();
    if (data?.org_id) return data.org_id as string;
  }

  // Single-org fallback — ONLY when there's genuinely one tenant. With multiple
  // orgs this is a multi-tenant deployment, and returning "the first org" to a
  // request that resolved no session would hand back an arbitrary tenant's data,
  // so we fail closed (null) instead. Single-tenant deployments pin DEFAULT_ORG_ID
  // (handled above) or simply have exactly one org. Deliberately NOT cached across
  // requests; per-request dedupe happens one layer up in active-org.ts.
  const { data, count } = await client
    .from("orgs")
    .select("id", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(1);
  if (count !== null && count > 1) return null; // multiple tenants → never guess
  return (data?.[0]?.id as string) ?? null;
}
