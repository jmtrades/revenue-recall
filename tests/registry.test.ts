import { describe, it, expect, afterEach } from "vitest";
import { getProvider, resolveProvider, listIntegrations } from "@/lib/crm/registry";
import { saveConnection, __resetConnectionsForTests } from "@/lib/connections/store";

/** Env keys this suite toggles; cleared after each test for isolation. */
const KEYS = [
  "CRM_PROVIDER",
  "CLOSE_API_KEY",
  "HUBSPOT_ACCESS_TOKEN",
  "PIPEDRIVE_API_TOKEN",
  "SALESFORCE_ACCESS_TOKEN",
  "SALESFORCE_INSTANCE_URL",
  "CRM_HTTP_BASE_URL",
  "ENCRYPTION_KEY",
];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function clear() {
  for (const k of KEYS) delete process.env[k];
}

describe("provider registry", () => {
  it("lists every shipped integration", () => {
    const ids = listIntegrations().map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["builtin", "supabase", "close", "hubspot", "pipedrive", "salesforce", "http"]));
  });

  it("falls back to the built-in CRM when nothing is configured", () => {
    clear();
    expect(getProvider().info().id).toBe("builtin");
  });

  it("falls back to built-in when a provider is named but not credentialed", () => {
    clear();
    process.env.CRM_PROVIDER = "hubspot"; // no token → not ready
    expect(getProvider().info().id).toBe("builtin");
  });

  it("honors an explicit, credentialed CRM_PROVIDER", () => {
    clear();
    process.env.CRM_PROVIDER = "hubspot";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat";
    expect(getProvider().info().id).toBe("hubspot");

    process.env.CRM_PROVIDER = "salesforce";
    process.env.SALESFORCE_ACCESS_TOKEN = "tok";
    process.env.SALESFORCE_INSTANCE_URL = "https://x.my.salesforce.com";
    expect(getProvider().info().id).toBe("salesforce");
  });

  it("auto-selects a connected CRM by credential, with a stable precedence", () => {
    clear();
    process.env.CRM_PROVIDER = "auto";
    process.env.PIPEDRIVE_API_TOKEN = "pd";
    expect(getProvider().info().id).toBe("pipedrive");

    // HubSpot outranks Pipedrive when both are present.
    process.env.HUBSPOT_ACCESS_TOKEN = "pat";
    expect(getProvider().info().id).toBe("hubspot");
  });

  it("resolveProvider activates a UI-connected database (auto mode)", async () => {
    clear();
    __resetConnectionsForTests();
    process.env.CRM_PROVIDER = "auto";
    process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-16-chars";
    // No DB connected yet → built-in.
    expect((await resolveProvider()).info().id).toBe("builtin");
    // Org connects their own database via the UI → it becomes active.
    await saveConnection({ kind: "database", provider: "database", secrets: { url: "https://my-db.example/leads" } });
    expect((await resolveProvider()).info().id).toBe("database");
    __resetConnectionsForTests();
  });

  it("resolveProvider respects an explicit non-database CRM_PROVIDER over a connected DB", async () => {
    clear();
    __resetConnectionsForTests();
    process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-16-chars";
    process.env.CRM_PROVIDER = "hubspot";
    process.env.HUBSPOT_ACCESS_TOKEN = "pat";
    await saveConnection({ kind: "database", provider: "database", secrets: { url: "https://my-db.example/leads" } });
    expect((await resolveProvider()).info().id).toBe("hubspot"); // explicit choice wins
    __resetConnectionsForTests();
  });
});
