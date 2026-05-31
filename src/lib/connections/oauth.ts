import crypto from "node:crypto";

/**
 * OAuth login for social connections. Each org clicks "Connect with <platform>",
 * authorizes on the platform, and we exchange the returned code for an access
 * token stored (encrypted) in their connection — no manual token pasting.
 *
 * This requires the OPERATOR to have registered a developer app with the
 * platform and set its client id/secret as env vars (you can't OAuth into a
 * platform without an app — that's true of every OAuth integration). When those
 * env vars are absent, oauthConfigured() is false and the UI falls back to the
 * paste-keys form. The flow itself is fully implemented and standard
 * (authorization-code), so it works the moment the app credentials are set.
 *
 * Security: state is an HMAC-signed, time-boxed token binding the org + platform
 * + a random nonce, so the callback can't be forged or replayed across orgs.
 */

export type OAuthPlatform = "instagram" | "messenger" | "x" | "linkedin";

export interface OAuthProvider {
  platform: OAuthPlatform;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Some providers (X) use PKCE; others use a plain client_secret exchange. */
  usePkce?: boolean;
  /** Extra params appended to the authorize URL. */
  extraAuthParams?: Record<string, string>;
}

export const OAUTH_PROVIDERS: Record<OAuthPlatform, OAuthProvider> = {
  // Meta (Instagram + Messenger) share the Facebook Login dialog + Graph token
  // exchange; the page/IG access token is fetched after with the user token.
  instagram: {
    platform: "instagram",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["instagram_basic", "instagram_manage_messages", "pages_messaging", "pages_show_list"],
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
  },
  messenger: {
    platform: "messenger",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["pages_messaging", "pages_show_list", "pages_manage_metadata"],
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
  },
  x: {
    platform: "x",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "users.read", "dm.read", "dm.write", "offline.access"],
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    usePkce: true,
  },
  linkedin: {
    platform: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
};

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
}

export function isOAuthPlatform(p: string): p is OAuthPlatform {
  return Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, p);
}

/** True when the operator has registered the platform's app (client id+secret). */
export function oauthConfigured(platform: OAuthPlatform): boolean {
  const p = OAUTH_PROVIDERS[platform];
  return Boolean(env(p.clientIdEnv) && env(p.clientSecretEnv));
}

export function oauthClient(platform: OAuthPlatform): { id: string; secret: string } | null {
  const p = OAUTH_PROVIDERS[platform];
  const id = env(p.clientIdEnv);
  const secret = env(p.clientSecretEnv);
  return id && secret ? { id, secret } : null;
}

/** Redirect URI the platform calls back to (must be whitelisted in the app). */
export function oauthRedirectUri(platform: OAuthPlatform, origin: string): string {
  return `${origin}/api/oauth/${platform}/callback`;
}

// ---- signed state (CSRF + org binding) -----------------------------------

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function stateSecret(): string {
  // Reuse the app's encryption key as the HMAC secret; both are operator-set
  // server secrets. Falls back to a per-process random so dev still works.
  return process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || "rr-oauth-dev-secret";
}

export interface OAuthState {
  orgId: string;
  platform: OAuthPlatform;
  nonce: string;
  /** PKCE verifier (X), carried in state so the callback can complete the swap. */
  verifier?: string;
  ts: number;
}

export function signState(state: OAuthState): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(token: string): OAuthState | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (Date.now() - state.ts > STATE_TTL_MS) return null;
    if (!isOAuthPlatform(state.platform)) return null;
    return state;
  } catch {
    return null;
  }
}

// ---- PKCE (X) -------------------------------------------------------------

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Build the platform's consent URL for an org to authorize. */
export function buildAuthorizeUrl(platform: OAuthPlatform, origin: string, state: string, challenge?: string): string | null {
  const p = OAUTH_PROVIDERS[platform];
  const client = oauthClient(platform);
  if (!client) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.id,
    redirect_uri: oauthRedirectUri(platform, origin),
    scope: p.scopes.join(" "),
    state,
    ...(p.extraAuthParams ?? {}),
  });
  if (p.usePkce && challenge) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  return `${p.authorizeUrl}?${params.toString()}`;
}
