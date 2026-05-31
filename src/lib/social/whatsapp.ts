import crypto from "node:crypto";
import type {
  InboundSocialMessage,
  OutboundSocialMessage,
  SocialChannel,
  SocialChannelInfo,
  SocialSendResult,
  WebhookEnvelope,
} from "@/lib/social/types";
import { resolveSocialCreds } from "@/lib/social/creds";

/**
 * WhatsApp Business (Meta Cloud API). Real Graph API shape: outbound via
 * /{phone-number-id}/messages with a bearer token; inbound via the Meta webhook
 * with X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret) and
 * the hub.challenge handshake on GET subscribe.
 *
 * Credentials resolve per-org first (the org's own connected WhatsApp number),
 * then fall back to env (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN) for single-tenant deploys.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const WA_KEYS = {
  token: "WHATSAPP_TOKEN",
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  appSecret: "WHATSAPP_APP_SECRET",
  verifyToken: "WHATSAPP_VERIFY_TOKEN",
};

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

function connected(): boolean {
  return Boolean(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"));
}

/** Constant-time verify of Meta's X-Hub-Signature-256 header. */
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const whatsappChannel: SocialChannel = {
  platform: "whatsapp",

  info(): SocialChannelInfo {
    return {
      platform: "whatsapp",
      label: "WhatsApp",
      connected: connected(),
      hint: "Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (Meta Cloud API) to message on WhatsApp.",
    };
  },

  async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
    const { token: tk, phoneNumberId: pnid } = await resolveSocialCreds("whatsapp", WA_KEYS);
    if (!tk || !pnid) return { id: "", status: "logged", platform: "whatsapp", detail: "not connected" };
    try {
      const res = await fetch(`${GRAPH}/${pnid}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: msg.to, type: "text", text: { body: msg.text } }),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `WhatsApp ${res.status}`);
      return { id: json.messages?.[0]?.id ?? "", status: "sent", platform: "whatsapp" };
    } catch (e) {
      return { id: "", status: "failed", platform: "whatsapp", detail: e instanceof Error ? e.message : "send failed" };
    }
  },

  async verifyChallenge(params: URLSearchParams): Promise<string | null> {
    // Meta GET subscribe handshake: echo hub.challenge when the verify token matches.
    const { verifyToken } = await resolveSocialCreds("whatsapp", WA_KEYS);
    if (params.get("hub.mode") === "subscribe" && verifyToken && params.get("hub.verify_token") === verifyToken) {
      return params.get("hub.challenge");
    }
    return null;
  },

  async parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
    const { appSecret } = await resolveSocialCreds("whatsapp", WA_KEYS);
    if (appSecret && !verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"], appSecret)) {
      throw new Error("bad whatsapp signature");
    }
    let body: MetaWebhook;
    try {
      body = JSON.parse(req.rawBody) as MetaWebhook;
    } catch {
      return [];
    }
    const out: InboundSocialMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const contacts = new Map((value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of value?.messages ?? []) {
          if (m.type !== "text" || !m.text?.body) continue;
          out.push({
            platform: "whatsapp",
            externalMessageId: m.id,
            from: { externalId: m.from, name: contacts.get(m.from) },
            toAccountId: value?.metadata?.phone_number_id,
            text: m.text.body,
            at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            raw: body,
          });
        }
      }
    }
    return out;
  },
};

interface MetaTextMessage {
  id: string;
  from: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
}
interface MetaWebhook {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: MetaTextMessage[];
      };
    }[];
  }[];
}
