import { NextResponse } from "next/server";
import { readApiKey } from "@/lib/api-keys";
import { resolveOrgByApiKey } from "@/lib/api-keys-server";
import { runWithOrg } from "@/lib/supabase/org-context";
import { rateLimit, distributedRateLimit, clientKey } from "@/lib/ratelimit";

/**
 * Shared auth for the public /api/v1 endpoints. Authenticates a request by its
 * workspace API key (Authorization: Bearer rr_live_… or x-api-key), rate-limits
 * per source, then runs the handler org-scoped via runWithOrg so every
 * downstream provider/store call targets the key's org. Returns 401 when the key
 * is missing/unknown — so no v1 route ever touches tenant data unauthenticated.
 */
type ApiHandler<C> = (req: Request, orgId: string, ctx: C) => Promise<Response> | Response;

const tooManyRequests = () => NextResponse.json({ error: "Too many requests" }, { status: 429 });

/** Per-workspace v1 cap (req/min). Tune with API_RATE_LIMIT_PER_MIN (default 600). */
function apiOrgLimitPerMin(): number {
  const n = Number(process.env.API_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? n : 600;
}

export function withApiKey<C = unknown>(handler: ApiHandler<C>): (req: Request, ctx: C) => Promise<Response> {
  return async (req: Request, ctx: C): Promise<Response> => {
    // Cheap per-IP pre-gate: absorb a dumb flood before we spend a DB round-trip
    // resolving the key (and before the per-org cap below). In-memory, so on
    // serverless it's really N_instances × this — hence it's only the first line.
    if (!rateLimit(clientKey(req, "apiv1"), 600, 60_000).ok) return tooManyRequests();
    const orgId = await resolveOrgByApiKey(readApiKey(req.headers));
    if (!orgId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
    // Per-WORKSPACE cap — the real unit of abuse and cost. The API key is the
    // credential, so an IP-keyed limit alone is trivially bypassed by rotating
    // source IPs; this caps a leaked/abused key no matter how many IPs it comes
    // from, and is cross-instance (Supabase-backed). It matters because each POST
    // runs captureLead, which starts the autonomous engine on the lead — an
    // uncapped flood is direct AI/outreach spend and spam from the org's own domain.
    if (!(await distributedRateLimit(`apiv1:org:${orgId}`, apiOrgLimitPerMin(), 60_000)).ok) return tooManyRequests();
    return runWithOrg(orgId, () => handler(req, orgId, ctx));
  };
}

/** Clamp a `?limit=` query param into a sane range (default 50, max 200). */
export function readLimit(req: Request, fallback = 50, max = 200): number {
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}
