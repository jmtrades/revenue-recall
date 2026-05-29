import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = path.join(os.tmpdir(), `rr-persist-${Date.now()}`);

describe("built-in store disk persistence (opt-in)", () => {
  beforeAll(() => {
    process.env.BUILTIN_PERSIST = "true";
    process.env.BUILTIN_PERSIST_DIR = dir;
  });
  afterAll(() => {
    delete process.env.BUILTIN_PERSIST;
    delete process.env.BUILTIN_PERSIST_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("writes mutations through to disk and reloads them after a restart", async () => {
    vi.resetModules();
    const { BuiltinProvider } = await import("@/lib/crm/providers/builtin");
    const created = await new BuiltinProvider().createContact({ name: "Persisted Person", points: [] });
    expect(fs.readdirSync(dir).some((f) => f.startsWith("builtin-"))).toBe(true);

    // Simulate a process restart: drop the in-memory singleton and re-import.
    vi.resetModules();
    const { BuiltinProvider: Fresh } = await import("@/lib/crm/providers/builtin");
    const reloaded = await new Fresh().getContact(created.id);
    expect(reloaded?.name).toBe("Persisted Person");
  });
});
