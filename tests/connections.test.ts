import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveConnection, getConnection, deleteConnection, listConnections, findOrgIdByAccount, __resetConnectionsForTests } from "@/lib/connections/store";

// No Supabase env → in-memory mode. ENCRYPTION_KEY set so secrets encrypt.
beforeEach(() => {
  __resetConnectionsForTests();
  process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-16-chars";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.DEFAULT_ORG_ID;
});
afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("per-org connections store", () => {
  it("saves and reads back a social connection with decrypted secrets", async () => {
    await saveConnection({
      kind: "social",
      provider: "whatsapp",
      accountRef: "pnid_123",
      secrets: { token: "wa_secret_token", appSecret: "app_secret" },
      config: { label: "Main WhatsApp" },
    });
    const c = await getConnection("whatsapp");
    expect(c).toBeTruthy();
    expect(c!.secrets.token).toBe("wa_secret_token");
    expect(c!.secrets.appSecret).toBe("app_secret");
    expect(c!.config.label).toBe("Main WhatsApp");
    expect(c!.accountRef).toBe("pnid_123");
    expect(c!.connected).toBe(true);
  });

  it("routes a webhook to the owning org by (provider, account_ref)", async () => {
    await saveConnection({ kind: "social", provider: "whatsapp", accountRef: "pnid_999", secrets: { token: "t" } });
    const orgId = await findOrgIdByAccount("whatsapp", "pnid_999");
    expect(orgId).toBeTruthy();
    expect(await findOrgIdByAccount("whatsapp", "unknown")).toBeNull();
    expect(await findOrgIdByAccount("telegram", "pnid_999")).toBeNull(); // provider must match too
  });

  it("lists connections and deletes one", async () => {
    await saveConnection({ kind: "social", provider: "telegram", secrets: { token: "bot" } });
    await saveConnection({ kind: "database", provider: "database", secrets: { url: "https://db.example/leads" } });
    expect((await listConnections()).map((c) => c.provider).sort()).toEqual(["database", "telegram"]);
    await deleteConnection("telegram");
    expect((await listConnections()).map((c) => c.provider)).toEqual(["database"]);
  });

  it("upserts (one row per provider)", async () => {
    await saveConnection({ kind: "social", provider: "x", secrets: { token: "v1" } });
    await saveConnection({ kind: "social", provider: "x", secrets: { token: "v2" } });
    expect((await listConnections()).filter((c) => c.provider === "x")).toHaveLength(1);
    expect((await getConnection("x"))!.secrets.token).toBe("v2");
  });

  it("refuses to store secrets without an encryption key", async () => {
    delete process.env.ENCRYPTION_KEY;
    await expect(saveConnection({ kind: "social", provider: "x", secrets: { token: "v" } })).rejects.toThrow(/ENCRYPTION_KEY/);
    // …but a secret-less config write is allowed.
    await expect(saveConnection({ kind: "database", provider: "database", config: { label: "x" } })).resolves.toBeUndefined();
  });
});
