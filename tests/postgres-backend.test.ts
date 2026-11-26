import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __closeFreeDbForTests, databaseBackend, readLocalSnapshot } from "@/lib/free/db";
import { __resetBuiltinForTests, BuiltinProvider } from "@/lib/crm/providers/builtin";
import { launchStatus } from "@/lib/launch";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";

const SAVED = { ...process.env };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-pg-"));

afterEach(() => {
  process.env = { ...SAVED };
  __closeFreeDbForTests();
  __resetBuiltinForTests();
});

describe("postgres-backed free store", () => {
  it("reports sqlite until a remote hydrate succeeds", () => {
    process.env.FREE_DB = "1";
    process.env.FREE_DB_DIR = dir;
    expect(["sqlite", "json"]).toContain(databaseBackend());
  });

  it("keeps a contact after the in-memory CRM is dropped", async () => {
    process.env.FREE_DB = "1";
    process.env.FREE_DB_DIR = dir;
    process.env.NEXT_PUBLIC_INDUSTRY = "education";
    const crm = new BuiltinProvider();
    const contact = await crm.createContact({ name: "Persist Proof", points: [], attributes: {} });
    __resetBuiltinForTests();
    const again = await new BuiltinProvider().getContact(contact.id);
    expect(again?.name).toBe("Persist Proof");
  });

  it("saves workspace settings without Supabase", async () => {
    process.env.FREE_DB = "1";
    process.env.FREE_DB_DIR = dir;
    const saved = await updateOrgSettings({ industryId: "education", name: "Webinar workspace" });
    expect(saved.persisted).toBe(true);
    expect(saved.industryId).toBe("education");
    __closeFreeDbForTests();
    const read = await getOrgSettings();
    expect(read.name).toBe("Webinar workspace");
  });

  it("imports a builtin CRM file into the snapshot", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "rr-snap-"));
    fs.writeFileSync(path.join(folder, "builtin-education.json"), JSON.stringify({ contacts: [{ id: "c1", name: "Imported" }] }));
    const snap = readLocalSnapshot(folder);
    expect(snap.docs.some((d) => d.kind === "crm:education")).toBe(true);
  });

  it("does not block launch on optional auth once a database is on", () => {
    process.env.FREE_DB = "1";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const status = launchStatus();
    expect(status.blockers.some((b) => /Auth is optional/i.test(b))).toBe(false);
    expect(status.warnings.some((w) => /Auth is optional/i.test(w))).toBe(true);
  });
});
