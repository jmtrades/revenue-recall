import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub only emitWebhook; keep the rest of the module real.
vi.mock("@/lib/webhooks-out", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/webhooks-out")>()),
  emitWebhook: vi.fn(),
}));

import { emitWebhook } from "@/lib/webhooks-out";
import { handleInbound } from "@/lib/inbound";
import { getProvider } from "@/lib/crm/registry";

const emit = emitWebhook as unknown as ReturnType<typeof vi.fn>;

describe("inbound message.received webhook", () => {
  beforeEach(() => {
    emit.mockClear();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.REPLY_AUTOPILOT;
  });

  it("emits message.received (matched) when a known contact replies", async () => {
    const email = `reply-${Date.now()}@acme.com`;
    await getProvider().createContact({ name: "Replier", points: [{ channel: "email", value: email }] });

    await handleInbound("email", email, "Yes — can you send pricing?", "Re: your note");

    const call = emit.mock.calls.find((c) => c[0] === "message.received");
    expect(call).toBeTruthy();
    expect(call?.[1]).toMatchObject({ channel: "email", from: email, matched: true });
  });

  it("emits message.received (unmatched) for a brand-new sender", async () => {
    const from = `+1999${(Date.now() % 1_000_000).toString().padStart(6, "0")}`;
    await handleInbound("sms", from, "hi there");

    const call = emit.mock.calls.find((c) => c[0] === "message.received");
    expect(call).toBeTruthy();
    expect(call?.[1]).toMatchObject({ channel: "sms", matched: false });
  });
});
