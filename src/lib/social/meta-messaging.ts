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
import { fetchWithRetry } from "@/lib/crm/net";
import { metaSendMode } from "@/lib/social/meta-window";

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

function alias(primary?: string, ...fallbacks: string[]): string | undefined {
  if (primary) return primary;
  for (const name of fallbacks) {
    const v = env(name);
    if (v) return v;
  }
  return undefined;
}

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
        connected: Boolean(alias(env(k.token), "META_PAGE_ACCESS_TOKEN")),
        hint: `Set ${k.token} or META_PAGE_ACCESS_TOKEN, plus META_APP_SECRET and META_VERIFY_TOKEN, to message on ${k.label}.`,
      };
    },

    async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
      const { token: resolved } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      const tk = alias(resolved, "META_PAGE_ACCESS_TOKEN", k.token);
      if (!tk) return { id: "", status: "logged", platform, detail: "not connected" };
      const mode = metaSendMode(msg.lastInboundAt);
      try {
        // retries:0 on a send (avoid double-send); still gets the hang timeout.
        const res = await fetchWithRetry(`${GRAPH}/me/messages?access_token=${encodeURIComponent(tk)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: msg.to }, message: { text: msg.text }, ...mode }),
        }, { retries: 0 });
        const json = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? `${k.label} ${res.status}`);
        return { id: json.message_id ?? "", status: "sent", platform };
      } catch (e) {
        return { id: "", status: "failed", platform, detail: e instanceof Error ? e.message : "send failed" };
      }
    },

    async verifyChallenge(params: URLSearchParams): Promise<string | null> {
      const { verifyToken } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      const token = alias(verifyToken, "META_VERIFY_TOKEN", k.verify);
      if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token) {
        return params.get("hub.challenge");
      }
      return null;
    },

    async parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
      const { appSecret: resolvedSecret } = await resolveSocialCreds(platform as SocialPlatform, credKeys);
      const appSecret = alias(resolvedSecret, "META_APP_SECRET", k.secret);
      // Fail closed in production when no app secret is configured (otherwise a
      // forged webhook is ingested into the resolved tenant's inbox).
      if (!appSecret) {
        if (process.env.NODE_ENV === "production") throw new Error(`${platform} webhook secret not configured — refusing unverified request`);
      } else if (!verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"], appSecret)) {
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
          if (ev.message?.is_echo || !ev.sender?.id) continue;
          const story = ev.message?.reply_to?.story?.id;
          const text = ev.message?.text || (story ? "Replied to your story" : "");
          if (!text) continue;
          out.push({
            platform,
            kind: story ? "story_reply" : "dm",
            externalMessageId: ev.message?.mid ?? `${ev.sender.id}:${ev.timestamp ?? Date.now()}`,
            from: { externalId: ev.sender.id },
            toAccountId: ev.recipient?.id ?? entry.id,
            text,
            at: ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString(),
            raw: body,
          });
        }
        for (const change of entry.changes ?? []) {
          if (change.field === "comments" || change.field === "mentions") {
            const from = change.value?.from?.id;
            const id = change.value?.id || change.value?.comment_id;
            if (!from && !id) continue;
            out.push({
              platform,
              kind: change.field === "mentions" ? "mention" : "comment",
              commentId: id,
              externalMessageId: id ?? `${from}:${change.value?.created_time ?? Date.now()}`,
              from: { externalId: from || id || "unknown", handle: change.value?.from?.username },
              toAccountId: entry.id,
              text: change.value?.text || (change.field === "mentions" ? "Mentioned you" : ""),
              at: new Date().toISOString(),
              raw: body,
            });
          }
          if (change.field === "leadgen" && change.value?.leadgen_id) {
            out.push({
              platform,
              kind: "lead",
              externalMessageId: `leadgen:${change.value.leadgen_id}`,
              from: { externalId: change.value.leadgen_id, name: "Meta lead" },
              toAccountId: change.value.page_id ?? entry.id,
              text: "New instant-form lead",
              at: change.value.created_time ? new Date(Number(change.value.created_time) * 1000).toISOString() : new Date().toISOString(),
              raw: change.value,
            });
          }
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
  message?: { mid?: string; text?: string; is_echo?: boolean; reply_to?: { story?: { id?: string } } };
}
interface MetaChange {
  field?: string;
  value?: {
    id?: string;
    comment_id?: string;
    text?: string;
    from?: { id?: string; username?: string };
    leadgen_id?: string;
    page_id?: string;
    created_time?: number;
  };
}
interface MetaMsgWebhook {
  entry?: { id?: string; messaging?: MetaMsgEvent[]; changes?: MetaChange[] }[];
}
