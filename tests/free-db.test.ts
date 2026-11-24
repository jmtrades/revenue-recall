import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openFreeStore } from "@/lib/free/db";

describe("free file database", () => {
  it("keeps rows in the JSON file when SQLite is not available", () => {
    process.env.FREE_STORE = "json";
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-free-json-"));
      const file = path.join(dir, "revenue-recall.sqlite");
      const db = openFreeStore(file);
      db.writeAnalytics("local", { dedupeKey: "k", name: "message.sent", occurredAt: "2026-06-01T00:00:00Z" });
      db.close();
      expect(fs.existsSync(file.replace(/\.sqlite$/, ".json"))).toBe(true);
      const again = openFreeStore(file);
      expect(again.readAnalytics("local")).toHaveLength(1);
      again.close();
      fs.rmSync(dir, { recursive: true, force: true });
    } finally {
      delete process.env.FREE_STORE;
    }
  });

  it("keeps an analytics row and a document across a reopen", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-free-"));
    const file = path.join(dir, "revenue-recall.sqlite");
    const db = openFreeStore(file);
    db.writeAnalytics("local", {
      dedupeKey: "msg:1",
      name: "message.sent",
      occurredAt: "2026-06-01T12:00:00Z",
      channel: "email",
      contactId: "c1",
    });
    db.writeAnalytics("local", {
      dedupeKey: "msg:1",
      name: "message.sent",
      occurredAt: "2026-06-01T12:00:00Z",
      channel: "email",
    });
    db.writeDoc("local", "webinar", { events: ["a"] });
    db.close();

    const again = openFreeStore(file);
    const rows = again.readAnalytics("local");
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe("msg:1");
    expect(again.readDoc<{ events: string[] }>("local", "webinar")?.events).toEqual(["a"]);
    again.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
