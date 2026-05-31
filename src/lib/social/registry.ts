import type { SocialChannel, SocialChannelInfo, SocialPlatform } from "@/lib/social/types";
import { telegramChannel } from "@/lib/social/telegram";
import { whatsappChannel } from "@/lib/social/whatsapp";
import { metaMessagingChannel } from "@/lib/social/meta-messaging";
import { linkedinChannel } from "@/lib/social/linkedin";
import { xChannel } from "@/lib/social/x";

/**
 * Social channel registry — the omnichannel counterpart to the CRM registry.
 * All known platforms are listed; each reports its own connectivity from env, so
 * Settings can show exactly what's live and what needs keys. Resolving a channel
 * by platform is how the inbound webhook and the outbound reply path pick the
 * right adapter, so a reply always leaves on the channel it arrived on.
 */
const CHANNELS: Record<SocialPlatform, SocialChannel> = {
  telegram: telegramChannel,
  whatsapp: whatsappChannel,
  instagram: metaMessagingChannel("instagram"),
  messenger: metaMessagingChannel("messenger"),
  linkedin: linkedinChannel,
  x: xChannel,
};

export function getSocialChannel(platform: SocialPlatform): SocialChannel | null {
  return CHANNELS[platform] ?? null;
}

export function listSocialChannels(): SocialChannelInfo[] {
  return Object.values(CHANNELS).map((c) => c.info());
}

export function connectedSocialChannels(): SocialChannelInfo[] {
  return listSocialChannels().filter((c) => c.connected);
}

export function anySocialConnected(): boolean {
  return listSocialChannels().some((c) => c.connected);
}
