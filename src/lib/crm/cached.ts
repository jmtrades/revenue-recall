import { cache } from "@/lib/cache";
import { resolveProvider } from "@/lib/crm/registry";
import type { Contact, Opportunity, Pipeline, User } from "@/lib/crm/types";

/**
 * Request-deduped accessors for the provider's expensive, no-argument list
 * calls. Several query helpers render on one page (e.g. the dashboard pulls
 * overview + reports + activity feed), and each independently needs the same
 * opportunities / pipelines / contacts. Wrapping these in React's per-request
 * cache collapses those into a single fetch per request — cutting redundant DB
 * round-trips on Supabase — with zero behavior change (in tests cache() is an
 * identity wrapper, so callers still get fresh data).
 *
 * These use resolveProvider() (async) so a database an org connected through the
 * UI becomes their active source on the main read paths, not just via env.
 */
export const cachedOpportunities = cache(async (): Promise<Opportunity[]> => (await resolveProvider()).listOpportunities());
export const cachedPipelines = cache(async (): Promise<Pipeline[]> => (await resolveProvider()).listPipelines());
export const cachedContacts = cache(async (): Promise<Contact[]> => (await resolveProvider()).listContacts());
export const cachedUsers = cache(async (): Promise<User[]> => (await resolveProvider()).listUsers());
