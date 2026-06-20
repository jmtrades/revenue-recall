import { describe, it, expect, vi, beforeEach } from "vitest";

// A prospect's WhatsApp/IG/Messenger reply must never be silently lost. When
// ingest fails transiently the webhook must return 5xx so the platform
// redelivers (ingest is idempotent), not 200 (which drops the lead forever).
const { parseWebhook, ingestSocialMessages, findOrgIdByAccount } = vi.hoisted(() => ({
  parseWebhook: vi.fn(),
  ingestSocialMessages: vi.fn(),
  findOrgIdByAccount: vi.fn(async () => null),
}));
vi.mock("@/lib/social/registry", () => ({ getSocialChannel: () => ({ parseWebhook }) }));
vi.mock("@/lib/social/ingest", () => ({ ingestSocialMessages }));
vi.mock("@/lib/connections/store", () => ({ findOrgIdByAccount }));

import { POST } from "@/app/api/social/[platform]/route";
import { _resetRateLimit } from "@/lib/ratelimit";

const req = (body = "{}") => new Request("http://x/api/social/whatsapp", { method: "POST", body, headers: { "content-type": "application/json" } });
const ctx = { params: { platform: "whatsapp" } };
const aMessage = { externalMessageId: "m1", toAccountId: "acct", from: { externalId: "u1" } };

describe("social webhook POST — never lose a lead reply", () => {
  beforeEach(() => {
    parseWebhook.mockReset();
    ingestSocialMessages.mockReset();
    _resetRateLimit();
  });

  it("returns 5xx so the platform redelivers when ingest fails", async () => {
    parseWebhook.mockResolvedValue([aMessage]);
    ingestSocialMessages.mockRejectedValue(new Error("db down"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500); // NOT 200 — the platform must retry
  });

  it("returns 200 once ingest succeeds", async () => {
    parseWebhook.mockResolvedValue([aMessage]);
    ingestSocialMessages.mockResolvedValue(undefined);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(ingestSocialMessages).toHaveBeenCalledOnce();
  });

  it("returns 200 with nothing to ingest", async () => {
    parseWebhook.mockResolvedValue([]);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(ingestSocialMessages).not.toHaveBeenCalled();
  });

  it("returns 401 on a signature/parse failure (unchanged)", async () => {
    parseWebhook.mockRejectedValue(new Error("bad signature"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
  });
});
