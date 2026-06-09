import type { CrmProvider, ProviderInfo } from "@/lib/crm/types";
import { BuiltinProvider } from "@/lib/crm/providers/builtin";
import { SupabaseProvider } from "@/lib/crm/providers/supabase";
import { CloseProvider } from "@/lib/crm/providers/close";
import { HubspotProvider } from "@/lib/crm/providers/hubspot";
import { PipedriveProvider } from "@/lib/crm/providers/pipedrive";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";
import { HttpCrmProvider } from "@/lib/crm/providers/http";
import { DatabaseProvider, databaseConfigured } from "@/lib/crm/providers/database";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getConfig, isAuthRequired } from "@/lib/config";

const httpCrmConfigured = (): boolean => Boolean(process.env.CRM_HTTP_BASE_URL);

/**
 * Provider registry. Resolves the active CrmProvider from config, and lists all
 * known integrations (with readiness) for the settings UI. Any external CRM can
 * be added here once it implements the CrmProvider interface.
 */

function build(id: string): CrmProvider {
  switch (id) {
    case "builtin":
      return new BuiltinProvider();
    case "supabase":
      return new SupabaseProvider();
    case "close":
      return new CloseProvider();
    case "http":
      return new HttpCrmProvider();
    case "database":
      return new DatabaseProvider();
    case "hubspot":
      return new HubspotProvider();
    case "salesforce":
      return new SalesforceProvider();
    case "pipedrive":
      return new PipedriveProvider();
    default:
      // Auto-select a connected source when one's configured, before the built-in.
      if (httpCrmConfigured()) return new HttpCrmProvider();
      if (databaseConfigured()) return new DatabaseProvider();
      // Env-configured named CRMs are a single-tenant convenience: on a
      // multi-tenant deployment (auth required) one stray env var would point
      // EVERY org at the same CRM account, so the auto-pick is skipped there.
      // Per-org CRMs come through resolveProvider()'s connection lookup; an
      // explicit CRM_PROVIDER (operator intent) still selects directly above.
      if (!isAuthRequired()) {
        if (process.env.HUBSPOT_ACCESS_TOKEN) return new HubspotProvider();
        if (process.env.PIPEDRIVE_API_TOKEN) return new PipedriveProvider();
        if ((process.env.SALESFORCE_ACCESS_TOKEN && process.env.SALESFORCE_INSTANCE_URL) || (process.env.SALESFORCE_REFRESH_TOKEN && process.env.SALESFORCE_CLIENT_ID)) return new SalesforceProvider();
        if (process.env.CLOSE_API_KEY) return new CloseProvider();
      }
      return isSupabaseConfigured() ? new SupabaseProvider() : new BuiltinProvider();
  }
}

/**
 * The active provider. An explicit CRM_PROVIDER wins; otherwise we prefer the
 * Supabase-backed store when configured, then fall back to the always-available
 * built-in CRM so the app never hard-fails.
 */
export function getProvider(): CrmProvider {
  const { providerId } = getConfig();
  try {
    const provider = build(providerId);
    return provider.info().ready ? provider : new BuiltinProvider();
  } catch {
    return new BuiltinProvider();
  }
}

/**
 * Async provider resolution that also honors a data source the org connected
 * through the UI (the encrypted per-org connections table, which the sync
 * getProvider() can't read): a bring-your-own database, or one of the named
 * CRMs (Close / HubSpot / Pipedrive / Salesforce) with the org's own
 * credentials. When no explicit CRM_PROVIDER override is in force and the org
 * has a connection, that provider becomes active for the tenant. Otherwise it
 * defers to the sync selection — identical behavior when nothing is connected.
 */
export async function resolveProvider(): Promise<CrmProvider> {
  const { providerId } = getConfig();
  // An explicit env/config provider choice always wins.
  if (providerId && providerId !== "auto" && providerId !== "database") return getProvider();
  try {
    // One org-scoped query for every connection (decrypted), then pick. The
    // database keeps its long-standing precedence; CRMs follow in a fixed order.
    const { listConnections } = await import("@/lib/connections/store");
    const conns = await listConnections();
    const by = (provider: string) => conns.find((c) => c.provider === provider);

    const db = by("database");
    if (db && (db.secrets.url || db.config.url)) return new DatabaseProvider();

    const close = by("close");
    if (close?.secrets.apiKey) return new CloseProvider(close.secrets.apiKey);

    const hubspot = by("hubspot");
    if (hubspot?.secrets.accessToken) return new HubspotProvider(hubspot.secrets.accessToken);

    const pipedrive = by("pipedrive");
    if (pipedrive?.secrets.apiToken) return new PipedriveProvider({ token: pipedrive.secrets.apiToken, base: pipedrive.config.apiBase });

    const salesforce = by("salesforce");
    if (salesforce?.secrets.accessToken && salesforce.config.instanceUrl) {
      return new SalesforceProvider({ token: salesforce.secrets.accessToken, instanceUrl: salesforce.config.instanceUrl });
    }
  } catch {
    // no connection / no org context → fall through
  }
  return getProvider();
}

export function listIntegrations(): ProviderInfo[] {
  return [
    new BuiltinProvider().info(),
    safeInfo(() => new SupabaseProvider().info(), {
      id: "supabase",
      label: "Built-in CRM (Supabase)",
      capabilities: { read: true, write: true, activities: true, customFields: true },
      ready: false,
    }),
    new CloseProvider().info(),
    new HubspotProvider().info(),
    new PipedriveProvider().info(),
    new SalesforceProvider().info(),
    new HttpCrmProvider().info(),
    new DatabaseProvider().info(),
  ];
}

function safeInfo(fn: () => ProviderInfo, fallback: ProviderInfo): ProviderInfo {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
