import { describe, it, expect, beforeEach } from "vitest";
import { draftReply } from "@/lib/ai/reply";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("draftReply (template fallback)", () => {
  it("acknowledges the prospect and proposes a next step (email)", async () => {
    const r = await draftReply({
      channel: "email",
      contactName: "Jordan Lee",
      dealTitle: "Acme — Deal",
      incoming: "Thanks, can you send pricing?",
      voice: { signature: "— Sam" },
    });
    expect(r.source).toBe("template");
    expect(r.subject).toMatch(/Re:/);
    expect(r.body).toContain("Jordan");
    expect(r.body).toContain("— Sam");
  });

  it("keeps SMS replies short and subject-less", async () => {
    const r = await draftReply({ channel: "sms", contactName: "Pat", dealTitle: "Deal", incoming: "who is this?" });
    expect(r.subject).toBeUndefined();
    expect(r.body.length).toBeLessThanOrEqual(320);
  });
});
