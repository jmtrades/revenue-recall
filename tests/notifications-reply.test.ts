import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/notifications/route";
import { getProvider } from "@/lib/crm/registry";

interface Note { id: string; kind: string; title: string; detail: string; href: string }

describe("notifications feed surfaces inbound replies", () => {
  it("shows 'X replied' for a recent inbound message", async () => {
    const provider = getProvider();
    const name = `Replier ${Date.now()}`;
    const c = await provider.createContact({ name, points: [{ channel: "email", value: `r-${Date.now()}@acme.com` }] });
    await provider.logActivity({ contactId: c.id, kind: "email", direction: "inbound", summary: "Yes — I'm interested, send pricing", occurredAt: new Date().toISOString() });

    const res = await GET(new Request("http://x/api/notifications"));
    const { items } = (await res.json()) as { items: Note[] };
    const reply = items.find((i) => i.kind === "reply" && i.title.includes(name));
    expect(reply).toBeTruthy();
    expect(reply!.detail.toLowerCase()).toContain("interested");
  });
});
