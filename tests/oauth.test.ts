import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isOAuthPlatform,
  oauthConfigured,
  buildAuthorizeUrl,
  oauthRedirectUri,
  signState,
  verifyState,
  pkcePair,
  type OAuthState,
} from "@/lib/connections/oauth";
import { exchangeCodeForToken, fetchMetaPageToken } from "@/lib/connections/oauth-exchange";

const realFetch = global.fetch;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-16-chars";
});
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
  for (const k of ["META_APP_ID", "META_APP_SECRET", "X_CLIENT_ID", "X_CLIENT_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "ENCRYPTION_KEY"]) {
    delete process.env[k];
  }
});

describe("oauth platform config", () => {
  it("recognizes the OAuth platforms", () => {
    expect(isOAuthPlatform("instagram")).toBe(true);
    expect(isOAuthPlatform("messenger")).toBe(true);
    expect(isOAuthPlatform("x")).toBe(true);
    expect(isOAuthPlatform("linkedin")).toBe(true);
    expect(isOAuthPlatform("telegram")).toBe(false); // bot-token, not OAuth
    expect(isOAuthPlatform("nope")).toBe(false);
  });

  it("reports configured only when app id+secret are set", () => {
    expect(oauthConfigured("instagram")).toBe(false);
    process.env.META_APP_ID = "app";
    process.env.META_APP_SECRET = "secret";
    expect(oauthConfigured("instagram")).toBe(true);
    expect(oauthConfigured("messenger")).toBe(true); // shares the Meta app
  });

  it("builds a platform consent URL with redirect, scopes, state, PKCE", () => {
    process.env.X_CLIENT_ID = "xid";
    process.env.X_CLIENT_SECRET = "xsecret";
    const { challenge } = pkcePair();
    const url = buildAuthorizeUrl("x", "https://app.example", "STATE123", challenge);
    expect(url).toBeTruthy();
    const u = new URL(url!);
    expect(u.origin + u.pathname).toBe("https://twitter.com/i/oauth2/authorize");
    expect(u.searchParams.get("client_id")).toBe("xid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example/api/oauth/x/callback");
    expect(u.searchParams.get("state")).toBe("STATE123");
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("dm.write");
  });

  it("returns null authorize URL when the app isn't configured", () => {
    expect(buildAuthorizeUrl("linkedin", "https://app.example", "S")).toBeNull();
  });

  it("derives the redirect URI per platform", () => {
    expect(oauthRedirectUri("messenger", "https://x.io")).toBe("https://x.io/api/oauth/messenger/callback");
  });
});

describe("oauth state (CSRF + org binding)", () => {
  const base: OAuthState = { orgId: "org_1", platform: "instagram", nonce: "abc", ts: Date.now() };

  it("round-trips a signed state", () => {
    const token = signState(base);
    const back = verifyState(token);
    expect(back?.orgId).toBe("org_1");
    expect(back?.platform).toBe("instagram");
  });

  it("rejects a tampered state", () => {
    const token = signState(base);
    expect(verifyState(token.slice(0, -3) + "xyz")).toBeNull();
    expect(verifyState("garbage")).toBeNull();
    expect(verifyState("")).toBeNull();
  });

  it("rejects an expired state", () => {
    const old = signState({ ...base, ts: Date.now() - 20 * 60 * 1000 });
    expect(verifyState(old)).toBeNull();
  });

  it("rejects when the signing key changed (cross-deploy forgery)", () => {
    const token = signState(base);
    process.env.ENCRYPTION_KEY = "a-different-key-at-least-16-chars-xx";
    expect(verifyState(token)).toBeNull();
  });

  it("carries a PKCE verifier through state", () => {
    const { verifier } = pkcePair();
    const back = verifyState(signState({ ...base, platform: "x", verifier }));
    expect(back?.verifier).toBe(verifier);
  });
});

describe("oauth token exchange", () => {
  it("exchanges a Meta code (GET, secret in query)", async () => {
    process.env.META_APP_ID = "mid";
    process.env.META_APP_SECRET = "msecret";
    let seenUrl = "";
    global.fetch = vi.fn(async (url: string) => {
      seenUrl = String(url);
      return { ok: true, json: async () => ({ access_token: "meta_token", expires_in: 3600 }) } as Response;
    }) as unknown as typeof fetch;
    const t = await exchangeCodeForToken("instagram", "CODE", "https://app.example");
    expect(t.accessToken).toBe("meta_token");
    expect(t.expiresIn).toBe(3600);
    expect(seenUrl).toContain("client_secret=msecret");
    expect(seenUrl).toContain("code=CODE");
  });

  it("exchanges an X code (POST, PKCE verifier + Basic auth)", async () => {
    process.env.X_CLIENT_ID = "xid";
    process.env.X_CLIENT_SECRET = "xsecret";
    let seenAuth = "";
    let seenBody = "";
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      seenBody = String(init?.body ?? "");
      return { ok: true, json: async () => ({ access_token: "x_token", refresh_token: "x_refresh" }) } as Response;
    }) as unknown as typeof fetch;
    const t = await exchangeCodeForToken("x", "CODE", "https://app.example", "VERIFIER");
    expect(t.accessToken).toBe("x_token");
    expect(t.refreshToken).toBe("x_refresh");
    expect(seenAuth).toMatch(/^Basic /);
    expect(seenBody).toContain("code_verifier=VERIFIER");
  });

  it("throws a clear error when the platform rejects the code", async () => {
    process.env.LINKEDIN_CLIENT_ID = "lid";
    process.env.LINKEDIN_CLIENT_SECRET = "lsecret";
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error_description: "invalid code" }) }) as Response) as unknown as typeof fetch;
    await expect(exchangeCodeForToken("linkedin", "BAD", "https://app.example")).rejects.toThrow(/invalid code/);
  });
});

describe("meta page-token resolution", () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("resolves the page token + page/IG id from the user token", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "page_1", name: "Acme Page", access_token: "PAGE_TOKEN", instagram_business_account: { id: "ig_1" } }] }),
    }) as Response) as unknown as typeof fetch;
    const page = await fetchMetaPageToken("USER_TOKEN");
    expect(page).toMatchObject({ pageToken: "PAGE_TOKEN", pageId: "page_1", igAccountId: "ig_1", name: "Acme Page" });
  });

  it("returns null when the user manages no page", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }) as Response) as unknown as typeof fetch;
    expect(await fetchMetaPageToken("USER_TOKEN")).toBeNull();
  });
});
