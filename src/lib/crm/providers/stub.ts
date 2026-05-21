import type { CrmProvider, ProviderInfo } from "@/lib/crm/types";

/**
 * Factory for not-yet-configured external CRM adapters. Each entry advertises
 * the integration in the UI and documents exactly what implementing it requires,
 * without pretending to return data. This is the extension point for adding any
 * CRM "in the world" — implement the CrmProvider interface and register it.
 */
export function makeStub(id: string, label: string): CrmProvider {
  const notReady = (): never => {
    throw new Error(`${label} integration is not configured. Implement a CrmProvider for "${id}" to enable it.`);
  };
  return {
    info(): ProviderInfo {
      return {
        id,
        label,
        capabilities: { read: true, write: false, activities: true, customFields: true },
        ready: false,
      };
    },
    listUsers: async () => notReady(),
    listPipelines: async () => notReady(),
    listContacts: async () => notReady(),
    getContact: async () => notReady(),
    createContact: async () => notReady(),
    listOpportunities: async () => notReady(),
    getOpportunity: async () => notReady(),
    createOpportunity: async () => notReady(),
    moveOpportunity: async () => notReady(),
    listActivities: async () => notReady(),
    listRecentActivities: async () => notReady(),
    logActivity: async () => notReady(),
  };
}
