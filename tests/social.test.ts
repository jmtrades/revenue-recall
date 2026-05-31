import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { telegramChannel } from "@/lib/social/telegram";
import { whatsappChannel, verifyMetaSignature } from "@/lib/social/whatsapp";
import { xChannel } from "@/lib/social/x";
import { listSocialChannels, getSocialChannel } from "@/lib/social/registry";
import { socialAttrKey } from "@/lib/social/ingest";

const SAVED = { ...process.env };
afterEach(() => {
  process.env = { ...SAVED };
});

describe("social registry", () => {
  it("lists every platform with connectivity from env", () => {
    const list = listSocialChannels();
    const platforms = list.map((c) => c.platform).sort();
    expect(platforms).toEqual(["instagram", "linkedin", "messenger", "telegram", "whatsapp", "x"]);
    // Nothing connected without keys.
    expect(list.every((c) => c.connected === false)).toBe(true);
  });

  it("reports connected once a platform's key is set", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    expect(getSocialChannel("telegram")!.info().connected).toBe(true);
  });
});

describe("telegram webhook", () => {
  it("rejects a bad secret token", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right";
    await expect(
      telegramChannel.parseWebhook({ rawBody: "{}", headers: { "x-telegram-bot-api-secret-token": "wrong" }, query: new URLSearchParams() }),
    ).rejects.toThrow();
  });

  it("parses a text message into the normalized shape", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const update = {
      message: { message_id: 7, date: 1700000000, text: "hi there", from: { id: 42, first_name: "Sam", username: "sammy" }, chat: { id: 99 } },
    };
    const msgs = await telegramChannel.parseWebhook({ rawBody: JSON.stringify(update), headers: {}, query: new URLSearchParams() });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ platform: "telegram", text: "hi there", externalMessageId: "7" });
    expect(msgs[0].from).toMatchObject({ externalId: "99", name: "Sam", handle: "@sammy" });
  });

  it("ignores non-text updates", async () => {
    const msgs = await telegramChannel.parseWebhook({ rawBody: JSON.stringify({ edited_message: { message_id: 1 } }), headers: {}, query: new URLSearchParams() });
    expect(msgs).toEqual([]);
  });
});

describe("whatsapp / meta signature", () => {
  it("verifies a correct HMAC-SHA256 signature and rejects a forged one", () => {
    const secret = "app_secret";
    const body = JSON.stringify({ hello: "world" });
    const good = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
    expect(verifyMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
  });

  it("echoes the hub.challenge only when the verify token matches", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "vtok";
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "vtok", "hub.challenge": "CHALLENGE" });
    const bad = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "CHALLENGE" });
    expect(whatsappChannel.verifyChallenge!(ok)).toBe("CHALLENGE");
    expect(whatsappChannel.verifyChallenge!(bad)).toBeNull();
  });

  it("parses a WhatsApp text message", async () => {
    delete process.env.WHATSAPP_APP_SECRET; // skip sig check for the parse test
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "15551234567", profile: { name: "Jordan" } }],
                messages: [{ id: "wamid.X", from: "15551234567", type: "text", timestamp: "1700000000", text: { body: "interested" } }],
              },
            },
          ],
        },
      ],
    };
    const msgs = await whatsappChannel.parseWebhook({ rawBody: JSON.stringify(body), headers: {}, query: new URLSearchParams() });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ platform: "whatsapp", text: "interested", from: { externalId: "15551234567", name: "Jordan" }, toAccountId: "PN1" });
  });
});

describe("x (twitter) DM webhook", () => {
  const SECRET = "x_app_secret";
  afterEach(() => {
    delete process.env.X_API_SECRET;
  });

  function sign(body: string): string {
    return "sha256=" + crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  }

  const activity = JSON.stringify({
    for_user_id: "me_1",
    direct_message_events: [
      { type: "message_create", id: "dm_1", created_timestamp: "1700000000000", message_create: { sender_id: "them_1", target: { recipient_id: "me_1" }, message_data: { text: "still available?" } } },
      // our own outbound echo — must be skipped
      { type: "message_create", id: "dm_2", message_create: { sender_id: "me_1", message_data: { text: "yes!" } } },
    ],
    users: { them_1: { screen_name: "buyer", name: "A Buyer" } },
  });

  it("parses an inbound DM and skips our own echoes", async () => {
    const msgs = await xChannel.parseWebhook({ rawBody: activity, headers: {}, query: new URLSearchParams() });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ platform: "x", text: "still available?", from: { externalId: "them_1", handle: "buyer", name: "A Buyer" } });
  });

  it("rejects a bad signature when X_API_SECRET is set", async () => {
    process.env.X_API_SECRET = SECRET;
    await expect(
      xChannel.parseWebhook({ rawBody: activity, headers: { "x-twitter-webhooks-signature": "sha256=wrong" }, query: new URLSearchParams() }),
    ).rejects.toThrow(/signature/);
  });

  it("accepts a correctly signed payload", async () => {
    process.env.X_API_SECRET = SECRET;
    const msgs = await xChannel.parseWebhook({ rawBody: activity, headers: { "x-twitter-webhooks-signature": sign(activity) }, query: new URLSearchParams() });
    expect(msgs).toHaveLength(1);
  });

  it("answers the CRC challenge", () => {
    process.env.X_API_SECRET = SECRET;
    const res = xChannel.verifyChallenge!(new URLSearchParams({ crc_token: "abc" }));
    expect(res).toContain("response_token");
  });
});

describe("ingest helpers", () => {
  it("namespaces social ids by platform", () => {
    expect(socialAttrKey("instagram")).toBe("social:instagram");
    expect(socialAttrKey("telegram")).toBe("social:telegram");
  });
});
