import { OAUTH_PROVIDERS, oauthClient, oauthRedirectUri, type OAuthPlatform } from "@/lib/connections/oauth";

/**
 * Exchange an authorization code for an access token. Standard OAuth2
 * authorization-code grant, with the per-platform quirks isolated here:
 *   - Meta (instagram/messenger): GET token endpoint, client_secret in query.
 *   - X: POST with PKCE verifier + HTTP Basic (client_id:client_secret).
 *   - LinkedIn: POST form with client_secret.
 * Returns the token bundle (access token + optional refresh/expiry) or throws.
 */

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  raw: Record<string, unknown>;
}

export async function exchangeCodeForToken(
  platform: OAuthPlatform,
  code: string,
  origin: string,
  verifier?: string,
): Promise<TokenResult> {
  const p = OAUTH_PROVIDERS[platform];
  const client = oauthClient(platform);
  if (!client) throw new Error(`${platform} OAuth app is not configured`);
  const redirectUri = oauthRedirectUri(platform, origin);

  let res: Response;
  if (platform === "instagram" || platform === "messenger") {
    // Meta: GET with params in the query string.
    const qs = new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      code,
    });
    res = await fetch(`${p.tokenUrl}?${qs.toString()}`, { method: "GET", signal: AbortSignal.timeout(15_000) });
  } else if (platform === "x") {
    // X: POST form with PKCE verifier + Basic auth.
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: client.id,
      ...(verifier ? { code_verifier: verifier } : {}),
    });
    const basic = Buffer.from(`${client.id}:${client.secret}`).toString("base64");
    res = await fetch(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } else {
    // LinkedIn (and OAuth2-standard): POST form with client_secret.
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: client.id,
      client_secret: client.secret,
    });
    res = await fetch(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error_description as string) || (json.error as string) || `token exchange ${res.status}`;
    throw new Error(msg);
  }
  const accessToken = json.access_token as string | undefined;
  if (!accessToken) throw new Error("No access token returned");
  return {
    accessToken,
    refreshToken: (json.refresh_token as string) ?? undefined,
    expiresIn: typeof json.expires_in === "number" ? (json.expires_in as number) : undefined,
    scope: (json.scope as string) ?? undefined,
    raw: json,
  };
}

export interface MetaPage {
  /** Page access token used to send/receive — distinct from the user token. */
  pageToken: string;
  /** Page id (Messenger) — the inbound-webhook account ref. */
  pageId: string;
  /** Linked Instagram business account id, when present. */
  igAccountId?: string;
  name?: string;
}

/**
 * Meta returns a USER token from the code exchange, but messaging uses a PAGE
 * token + the page/IG account id. Fetch the first managed page so a Meta connect
 * yields the credentials actually needed to send and to route inbound webhooks.
 * Returns null when the user manages no page (caller keeps the user token).
 */
export async function fetchMetaPageToken(userToken: string): Promise<MetaPage | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string } }[];
    };
    const page = json.data?.find((p) => p.access_token && p.id);
    if (!page?.access_token || !page.id) return null;
    return {
      pageToken: page.access_token,
      pageId: page.id,
      igAccountId: page.instagram_business_account?.id,
      name: page.name,
    };
  } catch {
    return null;
  }
}
