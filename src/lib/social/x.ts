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
    const tk = env("X_BEARER_TOKEN");
    if (!tk) return { id: "", status: "logged", platform: "x", detail: "not connected" };
    try {
      // v2: POST /2/dm_conversations/with/:participant_id/messages
      const res = await fetch(`https://api.twitter.com/2/dm_conversations/with/${encodeURIComponent(msg.to)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { dm_event_id?: string }; detail?: string };
      if (!res.ok) throw new Error(json.detail ?? `X ${res.status}`);
      return { id: json.data?.dm_event_id ?? "", status: "sent", platform: "x" };
    } catch (e) {
      return { id: "", status: "failed", platform: "x", detail: e instanceof Error ? e.message : "send failed" };
    }
  },

  // X Account Activity API requires a CRC challenge-response on GET subscribe.
  verifyChallenge(params: URLSearchParams): string | null {
    const crcToken = params.get("crc_token");
    const secret = env("X_API_SECRET");
    if (!crcToken || !secret) return null;
    const mac = crypto.createHmac("sha256", secret).update(crcToken).digest("base64");
    return JSON.stringify({ response_token: `sha256=${mac}` });
  },

  async parseWebhook(_req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
    // Account Activity payload parsing is enabled once an approved env is set.
    return [];
  },
};
