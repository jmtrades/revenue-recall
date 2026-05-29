import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";

/**
 * Verifies the OAuth refresh-token flow: a 401 triggers a token refresh and a
 * single retry, and when only refresh credentials are configured the provider
 * acquires a token proactively before its first call.
 */

interface Call { url: string; method: string; auth?: string; body?: string }
let calls: Call[] = [];

const KEYS = ["SALESFORCE_ACCESS_TOKEN", "SALESFORCE_INSTANCE_URL", "SALESFORCE_REFRESH_TOKEN", "SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_TOKEN_URL"];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

function stubFetch(handler: (c: Call) => { status: number; body: unknown }) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const c: Call = {
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
      body: init?.body as string | undefined,
    };
    calls.push(c);
    const r = handler(c);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
}

beforeEach(() => {
  calls = [];
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Salesforce OAuth refresh", () => {
  it("is ready with only refresh credentials", () => {
    process.env.SALESFORCE_REFRESH_TOKEN = "rt";
    process.env.SALESFORCE_CLIENT_ID = "cid";
    expect(new SalesforceProvider().info().ready).toBe(true);
  });

  it("refreshes on 401 and retries the request with the new token", () => {
    process.env.SALESFORCE_ACCESS_TOKEN = "stale";
    process.env.SALESFORCE_INSTANCE_URL = "https://old.my.salesforce.com";
    process.env.SALESFORCE_REFRESH_TOKEN = "rt";
    process.env.SALESFORCE_CLIENT_ID = "cid";
    process.env.SALESFORCE_CLIENT_SECRET = "secret";
    process.env.SALESFORCE_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";

    stubFetch((c) => {
      if (c.url.includes("/oauth2/token")) {
        expect(c.method).toBe("POST");
        expect(c.body).toContain("grant_type=refresh_token");
        expect(c.body).toContain("refresh_token=rt");
        expect(c.body).toContain("client_secret=secret");
        return { status: 200, body: { access_token: "fresh", instance_url: "https://new.my.salesforce.com" } };
      }
      // First query with the stale token is rejected; the retried one succeeds.
      if (c.auth === "Bearer stale") return { status: 401, body: [{ message: "expired" }] };
      return { status: 200, body: { done: true, records: [{ Id: "005", Name: "Sam", Email: "s@co.com" }] } };
    });

    return new SalesforceProvider().listUsers().then((users) => {
      expect(users).toEqual([{ id: "005", name: "Sam", email: "s@co.com" }]);
      const tokenCall = calls.find((c) => c.url.includes("/oauth2/token"));
      expect(tokenCall).toBeTruthy();
      // The retried query used the refreshed token against the new instance host.
      const retried = calls.find((c) => c.auth === "Bearer fresh");
      expect(retried).toBeTruthy();
      expect(retried!.url).toContain("new.my.salesforce.com");
    });
  });

  it("acquires a token proactively when only refresh creds are set", () => {
    process.env.SALESFORCE_REFRESH_TOKEN = "rt";
    process.env.SALESFORCE_CLIENT_ID = "cid";
    process.env.SALESFORCE_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";

    stubFetch((c) => {
      if (c.url.includes("/oauth2/token")) return { status: 200, body: { access_token: "fresh", instance_url: "https://acme.my.salesforce.com" } };
      return { status: 200, body: { done: true, records: [] } };
    });

    return new SalesforceProvider().listContacts().then(() => {
      // The very first network call is the token exchange (before any query).
      expect(calls[0].url).toContain("/oauth2/token");
      const query = calls.find((c) => c.url.includes("/services/data/"));
      expect(query!.auth).toBe("Bearer fresh");
      expect(query!.url).toContain("acme.my.salesforce.com");
    });
  });
});
