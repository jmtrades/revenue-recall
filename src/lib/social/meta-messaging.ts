import type {
  InboundSocialMessage,
  OutboundSocialMessage,
  SocialChannel,
  SocialChannelInfo,
  SocialPlatform,
  SocialSendResult,
  WebhookEnvelope,
} from "@/lib/social/types";
import { verifyMetaSignature } from "@/lib/social/whatsapp";
import { resolveSocialCreds } from "@/lib/social/creds";

/**
 * Instagram DMs + Facebook Messenger — both are Meta's Messenger Platform with
 * the same Graph send endpoint, the same X-Hub-Signature-256 verification, and
 * the same hub.challenge handshake. One factory serves both; the only
 * difference is which page/account token it reads.
 *
 * Credentials resolve per-org first (the org's own connected page/IG account),
 * then fall back to env for single-tenant deploys:
 *   Instagram:  IG_TOKEN, IG_APP_SECRET, IG_VERIFY_TOKEN
 *   Messenger:  MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET, MESSENGER_VERIFY_TOKEN
 */
const GRAPH = "https://graph.facebook.com/v21.0";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

const KEYS: Record<"instagram" | "messenger", { token: string; secret: string; verify: string; label: string }> = {
  instagram: { token: "IG_TOKEN", secret: "IG_APP_SECRET", verify: "IG_VERIFY_TOKEN", label: "Instagram" },
  messenger: { token: "MESSENGER_PAGE_TOKEN", secret: "MESSENGER_APP_SECRET", verify: "MESSENGER_VERIFY_TOKEN", label: "Messenger" },
};

export function metaMessagingChannel(platform: "instagram" | "messenger"): SocialChannel {
  const k = KEYS[platform];
  // Logical cred names → env vars, for resolveSocialCreds (per-org → env).
  const credKeys = { token: k.token, appSecret: k.secret, verifyToken: k.verify };

  return {
    platform: platform as SocialPlatform,

    info(): SocialChannelInfo {
      return {
        platform,
        label: k.label,
        connected: Boolean(env(k.token)),
        hint: `Set ${k.token} (Meta page/IG access token) to message on ${k.label}.`,
      };
    },

    async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
      const { token: tk } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      if (!tk) return { id: "", status: "logged", platform, detail: "not connected" };
      try {
        const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(tk)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: msg.to }, message: { text: msg.text }, messaging_type: "RESPONSE" }),
        });
        const json = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? `${k.label} ${res.status}`);
        return { id: json.message_id ?? "", status: "sent", platform };
      } catch (e) {
        return { id: "", status: "failed", platform, detail: e instanceof Error ? e.message : "send failed" };
      }
    },

    async verifyChallenge(params: URLSearchParams): Promise<string | null> {
      const { verifyToken } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      if (params.get("hub.mode") === "subscribe" && verifyToken && params.get("hub.verify_token") === verifyToken) {
        return params.get("hub.challenge");
      }
      return null;
    },

    async parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
      const { appSecret } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      if (appSecret && !verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"], appSecret)) {
        throw new Error(`bad ${platform} signature`);
      }
      let body: MetaMsgWebhook;
      try {
        body = JSON.parse(req.rawBody) as MetaMsgWebhook;
      } catch {
        return [];
      }
      const out: InboundSocialMessage[] = [];
      for (const entry of body.entry ?? []) {
        for (const ev of entry.messaging ?? []) {
          // Skip echoes (messages we sent) and non-text events.
          if (ev.message?.is_echo || !ev.message?.text || !ev.sender?.id) continue;
          out.push({
            platform,
            externalMessageId: ev.message.mid ?? `${ev.sender.id}:${ev.timestamp ?? Date.now()}`,
            from: { externalId: ev.sender.id },
            toAccountId: ev.recipient?.id,
            text: ev.message.text,
            at: ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString(),
            raw: body,
          });
        }
      }
      return out;
    },
  };
}

interface MetaMsgEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}
interface MetaMsgWebhook {
  entry?: { messaging?: MetaMsgEvent[] }[];
}
