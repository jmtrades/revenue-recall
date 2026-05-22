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

export function getConfig(): AppConfig {
  return {
    industryId: process.env.NEXT_PUBLIC_INDUSTRY ?? "real_estate",
    // "auto" → Supabase when configured, else the built-in store. Override with
    // an explicit provider id (builtin | supabase | close | …).
    providerId: process.env.CRM_PROVIDER ?? "auto",
    orgName: process.env.NEXT_PUBLIC_ORG_NAME ?? "Your Company",
    monthlyQuota: Number(process.env.NEXT_PUBLIC_MONTHLY_QUOTA ?? 250000),
    authRequired: process.env.NEXT_PUBLIC_AUTH_REQUIRED === "true",
  };
}
