import type {
  InboundSocialMessage,
  OutboundSocialMessage,
  SocialChannel,
  SocialChannelInfo,
  SocialSendResult,
  WebhookEnvelope,
} from "@/lib/social/types";

/**
 * X (Twitter) Direct Messages. DM send/receive requires elevated OAuth and the
 * Account Activity API (webhooks are app-approval gated). This adapter
 * implements the real v2 DM send shape and reports "not connected" until
 * X_BEARER_TOKEN is set; inbound (Account Activity) is wired once an approved
 * environment + CRC handshake is configured.
 *
 * Connect: X_BEARER_TOKEN (and, for inbound, X_API_SECRET for CRC).
 */
import crypto from "node:crypto";
import { resolveSocialCreds } from "@/lib/social/creds";
import { fetchWithRetry } from "@/lib/crm/net";

const X_KEYS = { token: "X_BEARER_TOKEN", apiSecret: "X_API_SECRET" };

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

export const xChannel: SocialChannel = {
  platform: "x",

  info(): SocialChannelInfo {
    return {
      platform: "x",
      label: "X (Twitter)",
      connected: Boolean(env("X_BEARER_TOKEN")),
      hint: "X DMs need elevated API access — set X_BEARER_TOKEN (and X_API_SECRET for inbound) to connect.",
    };
  },

  async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
    const { token: tk } = await resolveSocialCreds("x", X_KEYS);
    if (!tk) return { id: "", status: "logged", platform: "x", detail: "not connected" };
    try {
      // v2: POST /2/dm_conversations/with/:participant_id/messages
      // retries:0 on a send (avoid double-send); still gets the hang timeout.
      const res = await fetchWithRetry(`https://api.twitter.com/2/dm_conversations/with/${encodeURIComponent(msg.to)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text }),
      }, { retries: 0 });
      const json = (await res.json().catch(() => ({}))) as { data?: { dm_event_id?: string }; detail?: string };
      if (!res.ok) throw new Error(json.detail ?? `X ${res.status}`);
      return { id: json.data?.dm_event_id ?? "", status: "sent", platform: "x" };
    } catch (e) {
      return { id: "", status: "failed", platform: "x", detail: e instanceof Error ? e.message : "send failed" };
    }
  },

  // X Account Activity API requires a CRC challenge-response on GET subscribe.
  async verifyChallenge(params: URLSearchParams): Promise<string | null> {
    const crcToken = params.get("crc_token");
    const { apiSecret: secret } = await resolveSocialCreds("x", X_KEYS);
    if (!crcToken || !secret) return null;
    const mac = crypto.createHmac("sha256", secret).update(crcToken).digest("base64");
    return JSON.stringify({ response_token: `sha256=${mac}` });
  },

  async parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
    // Verify Account Activity signature (HMAC-SHA256 of the raw body, base64,
    // in the x-twitter-webhooks-signature header) when the secret is set.
    const { apiSecret: secret } = await resolveSocialCreds("x", X_KEYS);
    if (secret) {
      const header = req.headers["x-twitter-webhooks-signature"];
      const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody, "utf8").digest("base64");
      const ok = !!header && header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
      if (!ok) throw new Error("bad x signature");
    }
    let body: XActivity;
    try {
      body = JSON.parse(req.rawBody) as XActivity;
    } catch {
      return [];
    }
    // Don't echo our own outbound DMs back into the inbox.
    const selfId = body.for_user_id;
    const users = body.users ?? {};
    const out: InboundSocialMessage[] = [];
    for (const ev of body.direct_message_events ?? []) {
      if (ev.type !== "message_create" || !ev.message_create) continue;
      const senderId = ev.message_create.sender_id;
      const text = ev.message_create.message_data?.text;
      if (!senderId || !text || senderId === selfId) continue;
      out.push({
        platform: "x",
        externalMessageId: ev.id ?? `${senderId}:${ev.created_timestamp ?? Date.now()}`,
        from: { externalId: senderId, handle: users[senderId]?.screen_name, name: users[senderId]?.name },
        toAccountId: ev.message_create.target?.recipient_id,
        text,
        at: ev.created_timestamp ? new Date(Number(ev.created_timestamp)).toISOString() : new Date().toISOString(),
        raw: body,
      });
    }
    return out;
  },
};

interface XDmEvent {
  type?: string;
  id?: string;
  created_timestamp?: string;
  message_create?: {
    sender_id?: string;
    target?: { recipient_id?: string };
    message_data?: { text?: string };
  };
}
interface XActivity {
  for_user_id?: string;
  direct_message_events?: XDmEvent[];
  users?: Record<string, { screen_name?: string; name?: string }>;
}
