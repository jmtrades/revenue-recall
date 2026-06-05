import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { POST as sendMessage } from "@/app/api/messages/send/route";
import { _resetRateLimit } from "@/lib/ratelimit";

// No AI/Supabase → built-in CRM + simulated ("logged") sends.
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  _resetRateLimit();
});

const post = (body: unknown) =>
  sendMessage(new Request("http://localhost/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

async function outboundEmails(contactId: string, summary: string) {
  const acts = await getProvider().listActivitiesByContact!(contactId);
  return acts.filter((a) => a.direction === "outbound" && a.kind === "email" && a.summary === summary);
}

describe("manual send is idempotent against a re-submitted message", () => {
  it("a duplicate send is a no-op (deduped) — the prospect is messaged once", async () => {
    const c = await getProvider().createContact({ name: "Dedup", points: [{ channel: "email", value: `dd${Date.now()}@x.com` }] });

    const first = await post({ channel: "email", contactId: c.id, body: "Hello there" });
    expect(first.status).toBe(200);
    expect((await first.json()).deduped).toBeFalsy(); // really sent

    const second = await post({ channel: "email", contactId: c.id, body: "Hello there" });
    expect(second.status).toBe(200);
    expect((await second.json()).deduped).toBe(true); // recognized as the same send

    // Exactly one message landed on the timeline despite two POSTs.
    expect(await outboundEmails(c.id, "Hello there")).toHaveLength(1);
  });

  it("a genuinely different message still sends (no false dedup)", async () => {
    const c = await getProvider().createContact({ name: "Distinct", points: [{ channel: "email", value: `ds${Date.now()}@x.com` }] });

    expect((await (await post({ channel: "email", contactId: c.id, body: "First note" })).json()).deduped).toBeFalsy();
    expect((await (await post({ channel: "email", contactId: c.id, body: "Second, different note" })).json()).deduped).toBeFalsy();

    expect(await outboundEmails(c.id, "First note")).toHaveLength(1);
    expect(await outboundEmails(c.id, "Second, different note")).toHaveLength(1);
  });
});
