import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { POST } from "@/app/api/calls/place/route";
import { _resetRateLimit } from "@/lib/ratelimit";

// Placing a call is billable (telephony + STT + premium voice + the model). A
// double-click or a network-level retry must NOT dial twice. The route collapses
// a duplicate to the same number (per org) within a short window into one dial.
// Log mode (no VOICE_WEBHOOK_URL) → no real call is placed.
beforeEach(() => {
  delete process.env.VOICE_WEBHOOK_URL;
  delete process.env.CALL_REQUIRE_CONSENT;
  delete process.env.CALL_DEDUP_WINDOW_MS;
  _resetRateLimit();
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/calls/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("manual call route — idempotency", () => {
  it("collapses a rapid duplicate dial into one real call", async () => {
    const c = await getProvider().createContact({ name: "Dup", points: [{ channel: "phone", value: "+15558880000" }] });
    const first = await post({ contactId: c.id });
    expect(first.status).toBe(200);
    expect((await first.json()).deduped).toBeFalsy(); // the real dial

    const second = await post({ contactId: c.id });
    expect(second.status).toBe(200);
    expect((await second.json()).deduped).toBe(true); // the duplicate, collapsed
  });

  it("does not dedup a dial to a different number", async () => {
    const a = await getProvider().createContact({ name: "A", points: [{ channel: "phone", value: "+15558880001" }] });
    const b = await getProvider().createContact({ name: "B", points: [{ channel: "phone", value: "+15558880002" }] });
    expect((await (await post({ contactId: a.id })).json()).deduped).toBeFalsy();
    expect((await (await post({ contactId: b.id })).json()).deduped).toBeFalsy();
  });
});
