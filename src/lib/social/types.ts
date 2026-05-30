/**
 * Omnichannel social layer — the same provider-agnostic shape as the CRM and
 * comms layers. Each platform (WhatsApp, Instagram, Messenger, LinkedIn, X,
 * Telegram, …) implements SocialChannel; the registry resolves the connected
 * ones from env. Nothing here sends until a platform's keys are set, so the app
 * ships honest: every channel is "not connected" until you wire it.
 *
 * This is deliberately a real channel architecture, not a chat widget. Inbound
 * messages from every platform normalize into one InboundSocialMessage shape and
 * land in the unified inbox; outbound goes back through the same SocialChannel
 * the conversation arrived on, so a reply on Instagram leaves on Instagram.
 */

export type SocialPlatform =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "linkedin"
  | "x" // Twitter/X DMs
  | "telegram";

export interface SocialIdentity {
  /** Platform-scoped user id (PSID, IG-scoped id, handle, chat id, …). */
  externalId: string;
  /** Best display name we have for them. */
  name?: string;
  /** @handle / username where the platform exposes one. */
  handle?: string;
  avatarUrl?: string;
}

export interface OutboundSocialMessage {
  /** Who to send to, on this channel's id space. */
  to: string;
  text: string;
  /** Optional media (image/video/doc) URLs the platform supports. */
  mediaUrls?: string[];
  /** Optional reply-to (thread/message id) where the platform threads. */
  replyToId?: string;
}

export interface InboundSocialMessage {
  platform: SocialPlatform;
  /** Stable id of the message on the platform (for idempotency/dedupe). */
  externalMessageId: string;
  from: SocialIdentity;
  /** The account/page/number that received it (multi-account aware). */
  toAccountId?: string;
  text: string;
  mediaUrls?: string[];
  /** ISO timestamp the platform reported, else receipt time. */
  at: string;
  /** Raw provider payload, retained for audit/debug (never shown to users). */
  raw?: unknown;
}

export interface SocialSendResult {
  id: string;
  status: "sent" | "queued" | "logged" | "failed";
  platform: SocialPlatform;
  detail?: string;
}

export interface SocialChannelInfo {
  platform: SocialPlatform;
  label: string;
  /** True when this platform's credentials are present and usable. */
  connected: boolean;
  /** Short reason/hint shown in Settings when not connected. */
  hint: string;
}

export interface SocialChannel {
  platform: SocialPlatform;
  info(): SocialChannelInfo;
  /** Send a message out on this platform. */
  send(msg: OutboundSocialMessage): Promise<SocialSendResult>;
  /**
   * Verify + parse an inbound webhook request into normalized messages. Returns
   * [] for non-message events (delivery receipts, etc.). Throws on a failed
   * signature so the route can 401. `secret` is the platform's verify/app secret.
   */
  parseWebhook(req: WebhookEnvelope): Promise<InboundSocialMessage[]>;
  /** Some platforms (Meta) require echoing a challenge on GET subscribe. */
  verifyChallenge?(params: URLSearchParams): string | null;
}

/** What a channel needs from the incoming HTTP request to verify + parse. */
export interface WebhookEnvelope {
  rawBody: string;
  headers: Record<string, string>;
  query: URLSearchParams;
}
