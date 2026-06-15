import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { purgeOrgRecordings } from "@/lib/calls/recordings";

// Re-landed from PR #310 (GDPR call-recording erasure). Safe no-op without a DB.
const SAVED = { ...process.env };
beforeEach(() => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; });
afterEach(() => { process.env = { ...SAVED }; });

describe("purgeOrgRecordings", () => {
  it("is a safe no-op when there's no database", async () => {
    const r = await purgeOrgRecordings("org_x");
    expect(r).toEqual({ found: 0, deleted: 0, failed: [] });
  });
});
