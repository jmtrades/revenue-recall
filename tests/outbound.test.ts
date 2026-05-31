import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Contact } from "@/lib/crm/types";

vi.mock("@/lib/comms", () => ({
  sendEmail: vi.fn(async () => ({ id: "e1", status: "sent", provider: "mock-email" })),
  sendSms: vi.fn(async () => ({ id: "s1", status: "sent", provider: "mock-sms" })),
}));

vi.mock("@/lib/social/registry", () => ({
  // linkedin simulates a not-connected platform (null); the rest "send".
  getSocialChannel: vi.fn((platform: string) =>
    platform === "linkedin"
      ? null
      : {
          platform,
          info: () => ({ platform, label: platform, connected: true, hint: "" }),
          send: vi.fn(async () => ({ id: "x1", status: "sent", platform })),
          parseWebhook: async () => [],
        },
  ),
}));

import { sendReply, resolveAddress, isSocialChannel } from "@/lib/outbound";
import { sendEmail, sendSms } from "@/lib/comms";
import { getSocialChannel } from "@/lib/social/registry";

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    name: "Test",
    points: [
      { channel: "email", value: "t@x.io" },
      { channel: "phone", value: "+1 555 111 2222" },
    ],
    attributes: { "social:whatsapp": "wa_123", "social:telegram": "tg_456" },
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("unified outbound — reply on the channel it arrived on", () => {
  it("recognizes the six social platforms but not email/sms", () => {
    for (const p of ["whatsapp", "instagram", "messenger", "linkedin", "x", "telegram"]) {
      expect(isSocialChannel(p)).toBe(true);
    }
    expect(isSocialChannel("email")).toBe(false);
    expect(isSocialChannel("sms")).toBe(false);
    expect(isSocialChannel("nonsense")).toBe(false);
  });

  it("resolves the right address per channel", () => {
    const c = contact();
    expect(resolveAddress(c, "email")).toBe("t@x.io");
    expect(resolveAddress(c, "sms")).toBe("+1 555 111 2222");
    expect(resolveAddress(c, "whatsapp")).toBe("wa_123");
    expect(resolveAddress(c, "telegram")).toBe("tg_456");
    expect(resolveAddress(c, "instagram")).toBeUndefined(); // no IG id on file
    expect(resolveAddress(c, "email", "override@x.io")).toBe("override@x.io");
  });

  it("routes email replies through the comms email transport", async () => {
    const r = await sendReply({ contact: contact(), channel: "email", subject: "Hi", body: "Hello" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith("t@x.io", "Hi", "Hello");
    expect(r).toMatchObject({ status: "sent", provider: "mock-email", id: "e1" });
  });

  it("routes sms replies through the comms sms transport", async () => {
    const r = await sendReply({ contact: contact(), channel: "sms", body: "Yo" });
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith("+1 555 111 2222", "Yo");
    expect(r.provider).toBe("mock-sms");
  });

  it("routes a WhatsApp reply through the WhatsApp social channel", async () => {
    const r = await sendReply({ contact: contact(), channel: "whatsapp", body: "Hey there" });
    expect(vi.mocked(getSocialChannel)).toHaveBeenCalledWith("whatsapp");
    expect(r).toMatchObject({ status: "sent", provider: "whatsapp", id: "x1" });
  });

  it("fails cleanly when the contact has no address for the channel", async () => {
    const r = await sendReply({ contact: contact(), channel: "instagram", body: "Hi" });
    expect(r.status).toBe("failed");
    expect(r.detail).toMatch(/instagram/);
  });

  it("fails cleanly when the social platform isn't connected", async () => {
    const c = contact({ attributes: { "social:linkedin": "li_789" } });
    const r = await sendReply({ contact: c, channel: "linkedin", body: "Hi" });
    expect(r.status).toBe("failed");
    expect(r.detail).toMatch(/not connected/);
  });
});
