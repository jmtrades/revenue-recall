import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InboundSocialMessage } from "@/lib/social/types";

// Meta/WhatsApp redeliver webhooks on any timeout/non-2xx, so a social DM can
// arrive twice. Without dedup the second delivery re-runs autoReply → a duplicate
// DM to the prospect + a duplicate timeline entry. We dedup on externalMessageId
// via seenInboundEvent (mocked here, since it no-ops without a DB).
const { seenInboundEvent, forgetInboundEvent } = vi.hoisted(() => ({
  seenInboundEvent: vi.fn(async () => false),
  forgetInboundEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/inbound-dedup", () => ({ seenInboundEvent, forgetInboundEvent }));

import { ingestSocialMessages } from "@/lib/social/ingest";

let n = 0;
function msg(over: Partial<InboundSocialMessage> = {}): InboundSocialMessage {
  return {
    platform: "whatsapp",
    externalMessageId: `dup-${Date.now()}-${n++}`,
    from: { externalId: `wa-${Date.now()}-${n++}`, name: `Dedup ${Date.now()}-${n}` },
    text: "Hello, still available?",
    at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.REPLY_AUTOPILOT;
  seenInboundEvent.mockResolvedValue(false);
});

describe("social inbound idempotency", () => {
  it("skips a redelivered message (already-seen id) before any log or reply", async () => {
    seenInboundEvent.mockResolvedValue(true); // simulate "we've processed this id"
    const [res] = await ingestSocialMessages([msg()]);
    expect(res.duplicate).toBe(true);
    expect(res.logged).toBe(false);
    expect(res.created).toBe(false);
    expect(res.replied).toBeFalsy();
    expect(res.contactId).toBeUndefined(); // short-circuited before contact resolution
  });

  it("processes a first-seen message normally and dedups on platform + message id", async () => {
    const m = msg();
    const [res] = await ingestSocialMessages([m]);
    expect(res.duplicate).toBeFalsy();
    expect(res.logged).toBe(true);
    expect(seenInboundEvent).toHaveBeenCalledWith("whatsapp", m.externalMessageId);
  });
});
