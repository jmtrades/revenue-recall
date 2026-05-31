import type {
  InboundSocialMessage,
  OutboundSocialMessage,
  SocialChannel,
  SocialChannelInfo,
  SocialSendResult,
  WebhookEnvelope,
} from "@/lib/social/types";
import { resolveSocialCreds } from "@/lib/social/creds";
import { fetchWithRetry } from "@/lib/crm/net";

/**
 * Telegram channel — fully functional with just a bot token (no app review),
 * which makes it the reference implementation of the SocialChannel contract.
 * Inbound arrives via the Telegram Bot API webhook; we verify it with a secret
 * token Telegram echoes in the `X-Telegram-Bot-Api-Secret-Token` header.
 *
 * Credentials resolve per-org first (an org's own connected bot, from the
 * encrypted connections store), then fall back to env (TELEGRAM_BOT_TOKEN /
 * TELEGRAM_WEBHOOK_SECRET) for single-tenant / self-hosted deploys.
 */
const KEYS = { token: "TELEGRAM_BOT_TOKEN", webhookSecret: "TELEGRAM_WEBHOOK_SECRET" };

function envToken(): string | undefined {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.length > 0 ? t : undefined;
}

export const telegramChannel: SocialChannel = {
  platform: "telegram",

  info(): SocialChannelInfo {
    return {
      platform: "telegram",
      label: "Telegram",
      connected: Boolean(envToken()),
      hint: "Set TELEGRAM_BOT_TOKEN (from @BotFather) to send and receive Telegram DMs.",
    };
  },

  async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
    const { token: t } = await resolveSocialCreds("telegram", KEYS);
    if (!t) return { id: "", status: "logged", platform: "telegram", detail: "not connected" };
    try {
      // No retries on a send (a retry after an ambiguous failure risks a
      // double-send); fetchWithRetry still gives us the abort-on-hang timeout.
      const res = await fetchWithRetry(`https://api.telegram.org/bot${t}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: msg.to, text: msg.text, reply_to_message_id: msg.replyToId }),
      }, { retries: 0 });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!res.ok || !json.ok) throw new Error(json.description ?? `Telegram ${res.status}`);
      return { id: String(json.result?.message_id ?? ""), status: "sent", platform: "telegram" };
    } catch (e) {
      return { id: "", status: "failed", platform: "telegram", detail: e instanceof Error ? e.message : "send failed" };
    }
  },

  async parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
    const { webhookSecret: expected } = await resolveSocialCreds("telegram", KEYS);
    if (expected) {
      const got = req.headers["x-telegram-bot-api-secret-token"];
      if (got !== expected) throw new Error("bad telegram webhook secret");
    }
    let update: TelegramUpdate;
    try {
      update = JSON.parse(req.rawBody) as TelegramUpdate;
    } catch {
      return [];
    }
    const m = update.message ?? update.edited_message;
    if (!m || (!m.text && !m.caption)) return [];
    const from = m.from ?? {};
    return [
      {
        platform: "telegram",
        externalMessageId: String(m.message_id),
        from: {
          externalId: String(m.chat?.id ?? from.id ?? ""),
          name: [from.first_name, from.last_name].filter(Boolean).join(" ") || undefined,
          handle: from.username ? `@${from.username}` : undefined,
        },
        toAccountId: undefined,
        text: m.text ?? m.caption ?? "",
        at: m.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString(),
        raw: update,
      },
    ];
  },
};

interface TelegramUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TelegramMessage {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  from?: TelegramUser;
  chat?: { id?: number };
}
interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}
