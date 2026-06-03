import { channelStatus, type ChannelStatus } from "@/lib/comms";

/**
 * Live calling diagnostics. The Channels tab already shows whether each channel
 * is "Live" (a transport resolves), but for outbound AI *calls* that only means
 * VOICE_WEBHOOK_URL is set — it doesn't prove the gateway at that URL actually
 * answers. This pings the gateway's /health so a misconfigured or down gateway
 * shows red instead of a false green, and it catches the classic mistake of
 * pointing VOICE_WEBHOOK_URL at the app itself instead of the call-gateway.
 */

export interface GatewayHealth {
  reachable: boolean;
  /** True when the URL answers but looks like the app, not the gateway. */
  misdirected?: boolean;
  status?: string;
  voice?: boolean; // in-house neural voice wired
  brain?: boolean; // Anthropic key present
  twilio?: boolean; // twilio_ready() incl. PUBLIC_WSS_BASE
  transport?: string;
  detail?: string;
}

export interface CallingDiagnostics {
  channels: ChannelStatus;
  voiceConfigured: boolean;
  gatewayUrl: string | null;
  gateway: GatewayHealth | null;
}

/** Derive the gateway's /health URL from the app's VOICE_WEBHOOK_URL (…/voice). */
export function healthUrlFrom(voiceWebhook: string): string {
  try {
    const u = new URL(voiceWebhook);
    u.pathname = `${u.pathname.replace(/\/voice\/?$/, "")}/health`.replace(/\/{2,}/g, "/");
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return `${voiceWebhook.replace(/\/voice\/?$/, "")}/health`;
  }
}

export async function gatewayDiagnostics(): Promise<CallingDiagnostics> {
  const channels = channelStatus();
  const voiceWebhook = process.env.VOICE_WEBHOOK_URL;
  if (!voiceWebhook) {
    return { channels, voiceConfigured: false, gatewayUrl: null, gateway: null };
  }
  const url = healthUrlFrom(voiceWebhook);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return { channels, voiceConfigured: true, gatewayUrl: url, gateway: { reachable: false, detail: `HTTP ${res.status}` } };
    }
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const looksGateway = "transport" in j || "brain" in j || "logsBack" in j;
    const looksApp = "capabilities" in j || "launch" in j;
    if (looksApp && !looksGateway) {
      return {
        channels,
        voiceConfigured: true,
        gatewayUrl: url,
        gateway: { reachable: true, misdirected: true, detail: "This URL points at the app, not the call-gateway. Set VOICE_WEBHOOK_URL to https://<gateway-host>/voice." },
      };
    }
    return {
      channels,
      voiceConfigured: true,
      gatewayUrl: url,
      gateway: {
        reachable: true,
        status: typeof j.status === "string" ? j.status : undefined,
        voice: Boolean(j.voice),
        brain: Boolean(j.brain),
        twilio: Boolean(j.twilio),
        transport: typeof j.transport === "string" ? j.transport : undefined,
      },
    };
  } catch (e) {
    const detail = e instanceof Error ? (e.name === "AbortError" ? "timed out" : e.message) : "unreachable";
    return { channels, voiceConfigured: true, gatewayUrl: url, gateway: { reachable: false, detail } };
  }
}
