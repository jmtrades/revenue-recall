/**
 * Runtime configuration, resolved from environment variables with safe
 * defaults so the app boots with zero setup. In a multi-tenant deployment
 * these would come from the org's settings row instead.
 */

export interface AppConfig {
  /** Active industry template id (see lib/industries). */
  industryId: string;
  /** Which CRM provider to use: builtin | close | hubspot | salesforce | pipedrive. */
  providerId: string;
  orgName: string;
  /** Monthly revenue quota, used for goal attainment. */
  monthlyQuota: number;
  /** When true, app routes require a signed-in user (multi-tenant mode). */
  authRequired: boolean;
}

/**
 * Whether app routes require a signed-in user (multi-tenant mode).
 *
 * When a real auth backend (Supabase) is connected the app is multi-tenant by
 * definition, so sign-in is ALWAYS required — every user gets their own private
 * workspace. This is deliberately NOT overridable: running open on top of a
 * shared database would leak one org's data to anonymous visitors, and a
 * leftover `NEXT_PUBLIC_AUTH_REQUIRED=false` is the exact misconfiguration this
 * prevents (it kept production stuck on a single shared, open workspace).
 *
 * With no backend (the built-in demo store) there are no accounts to protect, so
 * gating stays off unless you explicitly opt in with `NEXT_PUBLIC_AUTH_REQUIRED=true`.
 */
export function isAuthRequired(): boolean {
  const hasBackend = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (hasBackend) return true;
  return process.env.NEXT_PUBLIC_AUTH_REQUIRED === "true";
}

export function getConfig(): AppConfig {
  return {
    industryId: process.env.NEXT_PUBLIC_INDUSTRY ?? "real_estate",
    // "auto" → Supabase when configured, else the built-in store. Override with
    // an explicit provider id (builtin | supabase | close | …).
    providerId: process.env.CRM_PROVIDER ?? "auto",
    orgName: process.env.NEXT_PUBLIC_ORG_NAME ?? "Your Company",
    monthlyQuota: Number(process.env.NEXT_PUBLIC_MONTHLY_QUOTA ?? 250000),
    authRequired: isAuthRequired(),
  };
}
