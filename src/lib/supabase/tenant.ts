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

  // Single-org fallback — deliberately NOT cached across requests. A module-level
  // cache could pin one tenant's org onto an unrelated request on a warm
  // serverless instance (a multi-tenant data-leak hazard). Per-request dedupe
  // already happens one layer up in active-org.ts via React cache().
  const { data } = await client.from("orgs").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}
