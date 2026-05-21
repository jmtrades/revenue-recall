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
}

export function getConfig(): AppConfig {
  return {
    industryId: process.env.NEXT_PUBLIC_INDUSTRY ?? "real_estate",
    providerId: process.env.CRM_PROVIDER ?? "builtin",
    orgName: process.env.NEXT_PUBLIC_ORG_NAME ?? "Your Company",
  };
}
