import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openSqlite, readAnalytics, writeAnalytics, writeDoc, readDoc } from "@/lib/free/db";

describe("free sqlite database", () => {
  it("keeps an analytics row and a document across a reopen", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-free-"));
    const file = path.join(dir, "revenue-recall.sqlite");
    const db = openSqlite(file);
    writeAnalytics(db, "local", {
      dedupeKey: "msg:1",
      name: "message.sent",
      occurredAt: "2026-06-01T12:00:00Z",
      channel: "email",
      contactId: "c1",
    });
    writeAnalytics(db, "local", {
      dedupeKey: "msg:1",
      name: "message.sent",
      occurredAt: "2026-06-01T12:00:00Z",
      channel: "email",
    });
    writeDoc(db, "local", "webinar", { events: ["a"] });
    db.close();

    const again = openSqlite(file);
    const rows = readAnalytics(again, "local");
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe("msg:1");
    expect(readDoc<{ events: string[] }>(again, "local", "webinar")?.events).toEqual(["a"]);
    again.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});