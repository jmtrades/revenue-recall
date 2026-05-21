import type { CrmProvider, ProviderInfo } from "@/lib/crm/types";
import { BuiltinProvider } from "@/lib/crm/providers/builtin";
import { CloseProvider } from "@/lib/crm/providers/close";
import { makeStub } from "@/lib/crm/providers/stub";
import { getConfig } from "@/lib/config";

/**
 * Provider registry. Resolves the active CrmProvider from config, and lists all
 * known integrations (with readiness) for the settings UI. Any external CRM can
 * be added here once it implements the CrmProvider interface.
 */

function build(id: string): CrmProvider {
  switch (id) {
    case "builtin":
      return new BuiltinProvider();
    case "close":
      return new CloseProvider();
    case "hubspot":
      return makeStub("hubspot", "HubSpot");
    case "salesforce":
      return makeStub("salesforce", "Salesforce");
    case "pipedrive":
      return makeStub("pipedrive", "Pipedrive");
    default:
      return new BuiltinProvider();
  }
}

/**
 * The active provider. If the configured provider isn't ready (e.g. missing API
 * key), transparently fall back to the always-available built-in CRM so the app
 * never hard-fails.
 */
export function getProvider(): CrmProvider {
  const { providerId } = getConfig();
  const provider = build(providerId);
  return provider.info().ready ? provider : new BuiltinProvider();
}

export function listIntegrations(): ProviderInfo[] {
  return [
    new BuiltinProvider().info(),
    new CloseProvider().info(),
    makeStub("hubspot", "HubSpot").info(),
    makeStub("salesforce", "Salesforce").info(),
    makeStub("pipedrive", "Pipedrive").info(),
  ];
}
