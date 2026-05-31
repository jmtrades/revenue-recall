import { getConnection } from "@/lib/connections/store";
import { runWithOrg } from "@/lib/supabase/org-context";
import type { SocialPlatform } from "@/lib/social/types";

/**
 * Resolve a social platform's credentials: an org's OWN connected credentials
 * (from the encrypted connections store) take precedence; otherwise we fall
 * back to the global env vars (single-tenant / self-hosted deploys). This is
 * what makes the same adapter serve a multi-tenant SaaS (each org connects their
 * own account) AND a solo self-hosted instance (env vars), with no code change.
 *
 * `keys` maps a logical name → its env var, e.g. { token: "TELEGRAM_BOT_TOKEN" }.
 * The returned object is keyed by the logical names.
 */
export async function resolveSocialCreds(
  platform: SocialPlatform,
  keys: Record<string, string>,
): Promise<Record<string, string | undefined>> {
  let connSecrets: Record<string, string> = {};
  let connConfig: Record<string, string> = {};
  try {
    const conn = await getConnection(platform);
    if (conn) {
      connSecrets = conn.secrets;
      connConfig = conn.config;
    }
  } catch {
    // No store / no org context (e.g. some webhook paths) → env only.
  }
  const out: Record<string, string | undefined> = {};
  for (const [logical, envVar] of Object.entries(keys)) {
    const fromConn = connSecrets[logical] || connConfig[logical];
    const fromEnv = process.env[envVar];
    out[logical] = fromConn && fromConn.length > 0 ? fromConn : fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
  }
  return out;
}

/**
 * Resolve creds for a SPECIFIC org (webhook path, no session). Runs the
 * resolution inside that org's context so getConnection reads the right row.
 */
export async function resolveSocialCredsForOrg(
  orgId: string,
  platform: SocialPlatform,
  keys: Record<string, string>,
): Promise<Record<string, string | undefined>> {
  return runWithOrg(orgId, () => resolveSocialCreds(platform, keys));
}
