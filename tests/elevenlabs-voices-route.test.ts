import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { listElevenVoices, requireRole } = vi.hoisted(() => ({
  listElevenVoices: vi.fn(async () => [] as unknown[]),
  requireRole: vi.fn(async () => null as unknown),
}));
vi.mock("@/lib/voice/tts", () => ({ listElevenVoices }));
vi.mock("@/lib/authz", () => ({ requireRole }));

import { GET } from "@/app/api/voice/elevenlabs/voices/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue(null);
});

const req = () => new Request("http://localhost/api/voice/elevenlabs/voices");

describe("GET /api/voice/elevenlabs/voices", () => {
  it("owner/admin gets the voice roster with configured=true when voices exist", async () => {
    listElevenVoices.mockResolvedValue([{ id: "v1", name: "Rachel", category: "premade" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; voices: unknown[] };
    expect(body.configured).toBe(true);
    expect(body.voices).toHaveLength(1);
  });

  it("configured=false when ElevenLabs isn't set up (empty roster)", async () => {
    listElevenVoices.mockResolvedValue([]);
    const res = await GET(req());
    const body = (await res.json()) as { configured: boolean };
    expect(body.configured).toBe(false);
  });

  it("is role-gated — a non-owner/admin is denied and the roster is never fetched", async () => {
    requireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(listElevenVoices).not.toHaveBeenCalled();
  });
});
