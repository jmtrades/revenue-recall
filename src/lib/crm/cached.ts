import { cache } from "@/lib/cache";
import { getProvider } from "@/lib/crm/registry";
import type { Contact, Opportunity, Pipeline, User } from "@/lib/crm/types";

/**
 * Request-deduped accessors for the provider's expensive, no-argument list
 * calls. Several query helpers render on one page (e.g. the dashboard pulls
 * overview + reports + activity feed), and each independently needs the same
 * opportunities / pipelines / contacts. Wrapping these in React's per-request
 * cache collapses those into a single fetch per request — cutting redundant DB
 * round-trips on Supabase — with zero behavior change (in tests cache() is an
 * identity wrapper, so callers still get fresh data).
 */
export const cachedOpportunities = cache((): Promise<Opportunity[]> => getProvider().listOpportunities());
export const cachedPipelines = cache((): Promise<Pipeline[]> => getProvider().listPipelines());
export const cachedContacts = cache((): Promise<Contact[]> => getProvider().listContacts());
export const cachedUsers = cache((): Promise<User[]> => getProvider().listUsers());
