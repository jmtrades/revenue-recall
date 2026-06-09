import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveConnection, __resetConnectionsForTests } from "@/lib/connections/store";
import { resolveProvider } from "@/lib/crm/registry";
import { CloseProvider } from "@/lib/crm/providers/close";
import { HubspotProvider } from "@/lib/crm/providers/hubspot";
import { PipedriveProvider } from "@/lib/crm/providers/pipedrive";
import { SalesforceProvider } from "@/lib/crm/providers/salesforce";
import { getProviderSpec } from "@/lib/connections/spec";

// No Supabase env → in-memory connections. ENCRYPTION_KEY so secrets encrypt.
beforeEach(() => {
  __resetConnectionsForTests();
  process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-16-chars";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.DEFAULT_ORG_ID;
});
afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("named CRM providers accept per-org credentials", () => {
  it("constructor credentials make a provider ready without any env", () => {
    expect(new CloseProvider("api_key").info().ready).toBe(true);
    expect(new HubspotProvider("pat-token").info().ready).toBe(true);
    expect(new PipedriveProvider({ token: "tok" }).info().ready).toBe(true);
    expect(new SalesforceProvider({ token: "tok", instanceUrl: "https://x.my.salesforce.com" }).info().ready).toBe(true);
  });

  it("without credentials they stay not-ready (registry falls back)", () => {
    expect(new CloseProvider().info().ready).toBe(false);
    expect(new HubspotProvider().info().ready).toBe(false);
  });
});

describe("connection specs for CRMs", () => {
  it("exposes a kind=crm spec for each named CRM", () => {
    for (const p of ["close", "hubspot", "pipedrive", "salesforce"]) {
      const spec = getProviderSpec(p);
      expect(spec?.kind).toBe("crm");
      expect(spec?.fields.some((f) => f.secret && f.required)).toBe(true);
    }
  });
});

describe("resolveProvider honors a per-org connected CRM", () => {
  it("activates Close with the org's stored API key", async () => {
    await saveConnection({ kind: "crm", provider: "close", secrets: { apiKey: "k_123" }, config: {} });
    const provider = await resolveProvider();
    expect(provider.info().id).toBe("close");
    expect(provider.info().ready).toBe(true);
  });

  it("activates HubSpot with the org's stored token", async () => {
    await saveConnection({ kind: "crm", provider: "hubspot", secrets: { accessToken: "pat-1" }, config: {} });
    expect((await resolveProvider()).info().id).toBe("hubspot");
  });

  it("a connected database keeps precedence over a connected CRM", async () => {
    await saveConnection({ kind: "crm", provider: "close", secrets: { apiKey: "k" }, config: {} });
    await saveConnection({ kind: "database", provider: "database", secrets: { url: "https://x/leads" }, config: {} });
    expect((await resolveProvider()).info().id).toBe("database");
  });

  it("falls back to the default provider when nothing is connected", async () => {
    const provider = await resolveProvider();
    expect(provider.info().id).toBe("builtin"); // no Supabase env in tests
  });

  it("salesforce needs both token and instance URL", async () => {
    await saveConnection({ kind: "crm", provider: "salesforce", secrets: { accessToken: "t" }, config: {} });
    expect((await resolveProvider()).info().id).toBe("builtin"); // missing instanceUrl → not activated
  });
});
