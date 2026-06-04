import { NextResponse } from "next/server";
import { readApiKey } from "@/lib/api-keys";
import { resolveOrgByApiKey } from "@/lib/api-keys-server";
import { runWithOrg } from "@/lib/supabase/org-context";
import { rateLimit, clientKey } from "@/lib/ratelimit";

/**
 * Shared auth for the public /api/v1 endpoints. Authenticates a request by its
 * workspace API key (Authorization: Bearer rr_live_… or x-api-key), rate-limits
 * per source, then runs the handler org-scoped via runWithOrg so every
 * downstream provider/store call targets the key's org. Returns 401 when the key
 * is missing/unknown — so no v1 route ever touches tenant data unauthenticated.
 */
type ApiHandler = (req: Request, orgId: string) => Promise<Response> | Response;

export function withApiKey(handler: ApiHandler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // The API key is the real gate; this just caps abuse per source.
    if (!rateLimit(clientKey(req, "apiv1"), 600, 60_000).ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const orgId = await resolveOrgByApiKey(readApiKey(req.headers));
    if (!orgId) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
    return runWithOrg(orgId, () => handler(req, orgId));
  };
}

/** Clamp a `?limit=` query param into a sane range (default 50, max 200). */
export function readLimit(req: Request, fallback = 50, max = 200): number {
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}
