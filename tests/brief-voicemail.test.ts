import { describe, it, expect, vi, beforeEach } from "vitest";

// withGuard is only an error-wrapper (no auth), so we can call POST directly once
// the data sources are stubbed. voicemailScript + getIndustry stay real.
const { getDealDetail, getOrgSettings, getActiveVoice, summarizeDeal, aiRateLimit } = vi.hoisted(() => ({
  getDealDetail: vi.fn(),
  getOrgSettings: vi.fn(async () => ({ industryId: "generic", language: "en" })),
  getActiveVoice: vi.fn(async () => ({ senderName: "Alex" })),
  summarizeDeal: vi.fn(async () => ({ summary: "s", nextStep: "n", talkingPoints: ["a"], risk: "r", source: "template" })),
  aiRateLimit: vi.fn(() => ({ ok: true })),
}));
vi.mock("@/lib/queries", () => ({ getDealDetail }));
vi.mock("@/lib/org", () => ({ getOrgSettings }));
vi.mock("@/lib/voice", () => ({ getActiveVoice }));
vi.mock("@/lib/ai/brief", () => ({ summarizeDeal }));
vi.mock("@/lib/ratelimit", () => ({ aiRateLimit }));

import { POST } from "@/app/api/ai/brief/route";

const post = (body: unknown) =>
  new Request("http://x/api/ai/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe("call-prep brief includes a ready voicemail", () => {
  it("returns a gap-aware voicemail naming the rep for a dormant deal", async () => {
    const longAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    getDealDetail.mockResolvedValue({
      opp: { id: "o1", title: "the rollout", value: 1000, currency: "USD", lastActivityAt: longAgo },
      contact: { name: "Jordan Lee", company: "Acme" },
      stage: { label: "Open", type: "open" },
      activities: [],
    });
    const res = await POST(post({ dealId: "o1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.voicemail).toBe("string");
    expect(body.voicemail).toContain("Jordan"); // greets the contact
    expect(body.voicemail).toContain("Alex"); // names the rep
    expect(body.voicemail.toLowerCase()).toMatch(/while|minute|pick things back up/); // reactivation tone for a dormant deal
    expect(body.summary).toBe("s"); // original brief fields preserved
  });

  it("still works (no rep name) for a fresh deal", async () => {
    getActiveVoice.mockResolvedValue({ senderName: undefined });
    getDealDetail.mockResolvedValue({
      opp: { id: "o2", title: "the pilot", value: 0, currency: "USD", lastActivityAt: new Date().toISOString() },
      contact: { name: "Sam" },
      stage: { label: "Open", type: "open" },
      activities: [],
    });
    const res = await POST(post({ dealId: "o2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voicemail).toContain("it's me"); // generic when no rep configured
    expect(body.voicemail).not.toContain("undefined");
  });
});
