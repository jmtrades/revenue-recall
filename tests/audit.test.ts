import { describe, it, expect } from "vitest";
import { recordAudit, listAudit } from "@/lib/audit";

describe("audit log", () => {
  it("recordAudit is best-effort — never throws without a DB", async () => {
    await expect(recordAudit("test.action", "target")).resolves.toBeUndefined();
  });

  it("listAudit returns [] without a DB", async () => {
    expect(await listAudit()).toEqual([]);
  });
});
