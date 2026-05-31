import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped org override. Inbound webhooks (social, etc.) have no user
 * session, so the normal "resolve org from the signed-in user" path can't apply.
 * Once a webhook has identified which org an event belongs to (by matching the
 * platform account against the connections table), it runs the rest of the
 * handler inside runWithOrg(orgId, …). resolveActiveOrgId() consults this store
 * first, so every downstream provider/store call is correctly org-scoped —
 * fixing the multi-tenant bug where all inbound messages went to the first org.
 */
const store = new AsyncLocalStorage<string>();

export function runWithOrg<T>(orgId: string, fn: () => T): T {
  return store.run(orgId, fn);
}

export function getOrgOverride(): string | undefined {
  return store.getStore();
}
