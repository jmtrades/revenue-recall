import type {
  InboundSocialMessage,
  OutboundSocialMessage,
  SocialChannel,
  SocialChannelInfo,
  SocialSendResult,
  WebhookEnvelope,
} from "@/lib/social/types";

/**
 * LinkedIn messaging. LinkedIn's messaging APIs are partner-gated (the Messages
 * API requires approved Marketing/Sales Navigator access), so this adapter is a
 * real-shaped scaffold: it reports "not connected" until LINKEDIN_ACCESS_TOKEN
 * is present and an approved messaging scope is wired. The send path targets the
 * real REST endpoint shape so finishing it is a credentials + scope task, not a
 * rewrite. Inbound LinkedIn does not push generic message webhooks to third
 * parties, so messages are pulled on the cadence tick rather than parsed here.
 */
const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

export const linkedinChannel: SocialChannel = {
  platform: "linkedin",

  info(): SocialChannelInfo {
    return {
      platform: "linkedin",
      label: "LinkedIn",
      connected: Boolean(env("LINKEDIN_ACCESS_TOKEN")),
      hint: "LinkedIn messaging is partner-gated — set LINKEDIN_ACCESS_TOKEN with an approved messaging scope to connect.",
    };
  },

  async send(msg: OutboundSocialMessage): Promise<SocialSendResult> {
    const tk = env("LINKEDIN_ACCESS_TOKEN");
    if (!tk) return { id: "", status: "logged", platform: "linkedin", detail: "not connected" };
    try {
      const res = await fetch("https://api.linkedin.com/rest/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tk}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": env("LINKEDIN_API_VERSION") ?? "202401",
        },
        body: JSON.stringify({ recipients: [msg.to], body: msg.text }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `LinkedIn ${res.status}`);
      }
      return { id: res.headers.get("x-restli-id") ?? "linkedin", status: "sent", platform: "linkedin" };
    } catch (e) {
      return { id: "", status: "failed", platform: "linkedin", detail: e instanceof Error ? e.message : "send failed" };
    }
  },

  // LinkedIn doesn't deliver generic inbound message webhooks to third parties;
  // inbound is reconciled by polling on the cadence tick when connected.
  async parseWebhook(_req: WebhookEnvelope): Promise<InboundSocialMessage[]> {
    return [];
  },
};
