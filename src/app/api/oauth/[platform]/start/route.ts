import { NextResponse } from "next/server";
import { isOAuthPlatform, oauthConfigured, buildAuthorizeUrl, signState, pkcePair, OAUTH_PROVIDERS } from "@/lib/connections/oauth";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { withGuard } from "@/lib/api/guard";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Begin an OAuth "Connect with <platform>" flow: resolve the current org, mint a
 * signed state binding (org + platform + nonce, plus a PKCE verifier for X), and
 * redirect the user to the platform's consent screen. Auth-gated by middleware,
 * so only a signed-in member can start a connection for their org.
 */
export const GET = withGuard(async (req: Request, { params }: { params: Promise<{ platform: string }> }) => {
  const platform = (await params).platform;
  if (!isOAuthPlatform(platform)) return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  if (!oauthConfigured(platform)) {
    const p = OAUTH_PROVIDERS[platform];
    return NextResponse.json(
      { error: `${platform} OAuth isn't configured. Set ${p.clientIdEnv} and ${p.clientSecretEnv}, or connect with keys.` },
      { status: 503 },
    );
  }

  const orgId = await resolveActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const pkce = OAUTH_PROVIDERS[platform].usePkce ? pkcePair() : undefined;
  const state = signState({ orgId, platform, nonce: crypto.randomBytes(8).toString("hex"), verifier: pkce?.verifier, ts: Date.now() });
  const url = buildAuthorizeUrl(platform, origin, state, pkce?.challenge);
  if (!url) return NextResponse.json({ error: "Could not build authorize URL" }, { status: 500 });

  return NextResponse.redirect(url);
});
