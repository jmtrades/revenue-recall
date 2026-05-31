import { NextResponse } from "next/server";
import { isOAuthPlatform, verifyState } from "@/lib/connections/oauth";
import { exchangeCodeForToken, fetchMetaPageToken } from "@/lib/connections/oauth-exchange";
import { saveConnection } from "@/lib/connections/store";
import { runWithOrg } from "@/lib/supabase/org-context";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: the platform redirects here with ?code & ?state. We verify the
 * signed state (CSRF + org binding), exchange the code for an access token, and
 * save it to the right org's connection (encrypted) — running inside that org's
 * context since there's no user session on a redirect from the platform. Then
 * bounce back to Settings with a status flag.
 *
 * Public route (no session) — the signed, time-boxed, HMAC'd state is what
 * authenticates it. A forged/expired/cross-org state is rejected.
 */
function back(origin: string, status: string): NextResponse {
  return NextResponse.redirect(`${origin}/settings?tab=channels&connected=${status}`);
}

export async function GET(req: Request, { params }: { params: { platform: string } }) {
  const platform = params.platform;
  const origin = new URL(req.url).origin;
  if (!isOAuthPlatform(platform)) return back(origin, "error");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied) return back(origin, "denied"); // user declined on the consent screen
  if (!code || !stateToken) return back(origin, "error");

  const state = verifyState(stateToken);
  if (!state || state.platform !== platform) return back(origin, "error");

  try {
    const token = await exchangeCodeForToken(platform, code, origin, state.verifier);

    // Default: store the token from the code exchange.
    let sendToken = token.accessToken;
    let accountRef: string | undefined;
    const extraConfig: Record<string, string> = {};

    // Meta returns a USER token, but messaging needs a PAGE token + page/IG id.
    // Resolve the managed page so the connection can actually send + route inbound.
    if (platform === "instagram" || platform === "messenger") {
      const page = await fetchMetaPageToken(token.accessToken);
      if (page) {
        sendToken = page.pageToken;
        accountRef = platform === "instagram" ? page.igAccountId ?? page.pageId : page.pageId;
        if (page.name) extraConfig.label = page.name;
        if (accountRef) extraConfig.accountId = accountRef;
      }
    }

    // Save into the authorizing org's connection (encrypted at rest).
    await runWithOrg(state.orgId, async () => {
      await saveConnection({
        kind: "social",
        provider: platform,
        accountRef,
        secrets: {
          token: sendToken,
          ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        },
        config: {
          auth: "oauth",
          ...(token.expiresIn ? { expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString() } : {}),
          ...(token.scope ? { scope: token.scope } : {}),
          ...extraConfig,
        },
      });
    });
    return back(origin, "success");
  } catch {
    return back(origin, "error");
  }
}
