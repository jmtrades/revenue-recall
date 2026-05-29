import type { CrmProvider, ProviderInfo } from "@/lib/crm/types";
import { BuiltinProvider } from "@/lib/crm/providers/builtin";
import { SupabaseProvider } from "@/lib/crm/providers/supabase";
import { CloseProvider } from "@/lib/crm/providers/close";
import { HttpCrmProvider } from "@/lib/crm/providers/http";
import { makeStub } from "@/lib/crm/providers/stub";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getConfig } from "@/lib/config";

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
    case "hubspot":
      return makeStub("hubspot", "HubSpot");
    case "salesforce":
      return makeStub("salesforce", "Salesforce");
    case "pipedrive":
      return makeStub("pipedrive", "Pipedrive");
    default:
      // Auto-select a connected CRM when one's configured, before the built-in.
      if (httpCrmConfigured()) return new HttpCrmProvider();
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
    new HttpCrmProvider().info(),
    makeStub("hubspot", "HubSpot").info(),
    makeStub("salesforce", "Salesforce").info(),
    makeStub("pipedrive", "Pipedrive").info(),
  ];
}

function safeInfo(fn: () => ProviderInfo, fallback: ProviderInfo): ProviderInfo {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
