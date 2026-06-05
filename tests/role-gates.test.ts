import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Control requireRole so we can prove each sensitive route is gated by it.
const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireRole };
});

import { POST as connectionsPOST, DELETE as connectionsDELETE } from "@/app/api/connections/route";
import { POST as numbersPOST } from "@/app/api/numbers/route";
import { POST as automationsPOST } from "@/app/api/automations/route";
import { POST as voicePOST } from "@/app/api/voice/select/route";

const req = (url: string, body: unknown, method = "POST") =>
  new Request(`http://x${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const deny = () => requireRole.mockResolvedValue(NextResponse.json({ error: "nope" }, { status: 403 }));
const allow = () => requireRole.mockResolvedValue(null);

beforeEach(() => requireRole.mockReset());

describe("owner/admin gates on org-wide settings routes", () => {
  it("connections POST + DELETE are gated", async () => {
    deny();
    expect((await connectionsPOST(req("/api/connections", { provider: "close", values: {} }))).status).toBe(403);
    expect((await connectionsDELETE(req("/api/connections", { provider: "close" }, "DELETE"))).status).toBe(403);
  });

  it("buying a number / setting caller ID is gated, but searching is not", async () => {
    deny();
    expect((await numbersPOST(req("/api/numbers", { action: "set_caller_id", number: "+15551234567" }))).status).toBe(403);
    expect((await numbersPOST(req("/api/numbers", { action: "buy", number: "+15551234567" }))).status).toBe(403);
    // search must NOT require a role (and doesn't even call requireRole).
    requireRole.mockClear();
    const res = await numbersPOST(req("/api/numbers", { action: "search", areaCode: "415" }));
    expect(res.status).not.toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("automations + voice selection are gated", async () => {
    deny();
    expect((await automationsPOST(req("/api/automations", { id: "speed_to_lead", enabled: false }))).status).toBe(403);
    expect((await voicePOST(req("/api/voice/select", { voiceId: "af_heart" }))).status).toBe(403);
  });

  it("a permitted owner/admin is not blocked (no 403)", async () => {
    allow();
    expect((await automationsPOST(req("/api/automations", { id: "speed_to_lead", enabled: false }))).status).not.toBe(403);
  });
});
