import { channelStatus } from "@/lib/comms";
import { complianceConfig, emailDomainVerified, smsA2pRegistered } from "@/lib/compliance";
import { gatewayDiagnostics } from "@/lib/calls/diagnostics";

/**
 * One readiness source of truth for "can we actually send / call on this
 * channel?". Both the Settings → Channels rows and the Go Live console derive
 * channel state from here, and the send/call routes gate on it — so a channel
 * can never show "Live" on one screen while real sends are blocked on another.
 *
 * Three states:
 *   • "logging" — no real transport connected; messages are recorded to the
 *     timeline so flows work end-to-end, but nothing leaves the building.
 *   • "setup"   — a real transport IS connected, but real outbound is HELD until
 *     compliance/health prerequisites pass (domain auth + postal for email, A2P
 *     for SMS, a reachable gateway for calls). Still logs, never blasts.
 *   • "live"    — connected AND cleared; real outbound dispatches.
 *
 * Pure predicates (testable) sit below; the async aggregator gathers live signals.
 */

export type ChannelState = "logging" | "setup" | "live";

export interface ChannelReadiness {
  state: ChannelState;
  /** Short badge text: "Live" | "Setup needed" | "Logging only". */
  label: string;
  /** Plain-English, customer-facing — no vendor/env identifiers. */
  detail: string;
  /** Real outbound actually dispatches on this channel right now. */
  canSend: boolean;
  /** Outstanding prerequisites when state === "setup". */
  blockers: string[];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const LABEL: Record<ChannelState, string> = { live: "Live", setup: "Setup needed", logging: "Logging only" };

function live(detail: string): ChannelReadiness {
  return { state: "live", label: LABEL.live, detail, canSend: true, blockers: [] };
}
function logging(detail: string): ChannelReadiness {
  return { state: "logging", label: LABEL.logging, detail, canSend: false, blockers: [] };
}
function setup(detail: string, blockers: string[]): ChannelReadiness {
  return { state: "setup", label: LABEL.setup, detail, canSend: false, blockers };
}

/** Email: a real sender + (when compliance is on) a postal address and a
 *  verified sending domain before real mail goes out. */
export function emailReadiness(opts: { live: boolean; complianceOn: boolean; address?: string | null; domainVerified: boolean }): ChannelReadiness {
  if (!opts.live) return logging("No email sender connected — messages are recorded to the timeline so flows still work. Connect one to send for real.");
  if (!opts.complianceOn) return live("Connected — email sends for real.");
  const blockers: string[] = [];
  if (!opts.address?.trim()) blockers.push("a postal address (required by CAN-SPAM)");
  if (!opts.domainVerified) blockers.push("a verified sending domain");
  if (blockers.length) return setup(`A sender is connected, but real email is held until you add ${joinList(blockers)}. Until then messages are logged.`, blockers);
  return live("Connected and verified — email sends for real.");
}

/** SMS: a real sender + (when compliance is on) A2P 10DLC registration. */
export function smsReadiness(opts: { live: boolean; complianceOn: boolean; a2pRegistered: boolean }): ChannelReadiness {
  if (!opts.live) return logging("No texting connected — messages are recorded to the timeline. Connect a number to send for real.");
  if (!opts.complianceOn) return live("Connected — SMS sends for real.");
  if (!opts.a2pRegistered) return setup("A texting number is connected, but real SMS is held until carrier registration (A2P 10DLC brand + campaign) is recorded. Until then texts are logged.", ["carrier registration (A2P 10DLC brand + campaign)"]);
  return live("Connected and registered — SMS sends for real.");
}

/** Voice: a real telephony transport + a reachable, correctly-pointed gateway
 *  that can actually ORIGINATE a call. `placeable` is the gateway's own telephony
 *  readiness (its Twilio trunk + PUBLIC_WSS_BASE); null = direct Twilio / unknown. */
export function voiceReadiness(opts: { live: boolean; reachable: boolean | null; misdirected: boolean; placeable?: boolean | null }): ChannelReadiness {
  if (!opts.live) return logging("No calling connected — calls are logged to the timeline, not dialed.");
  if (opts.misdirected) return setup("Calling is connected, but the gateway address points at the app instead of the call service.", ["a correctly pointed call gateway"]);
  if (opts.reachable === false) return setup("Calling is connected, but the call gateway isn't responding — calls won't connect until it's back.", ["a reachable call gateway"]);
  // The gateway answers /health but can't dial yet (its phone trunk isn't wired on
  // it) — showing "Live" here would make the Call button lie. Hold it at "setup".
  if (opts.reachable === true && opts.placeable === false)
    return setup("Calling is connected and the gateway is up, but it can't place calls yet — its phone line still needs to be set up on the gateway. Until then calls are logged.", ["a call gateway with its phone line configured"]);
  return live("Connected — calls dial out for real.");
}

/** Email send-readiness, synchronous (no network). Used by the send gate and the
 *  Channels email row. */
export function emailSendReadiness(address?: string | null): ChannelReadiness {
  const cc = complianceConfig({ address: address ?? undefined });
  return emailReadiness({ live: channelStatus().email.live, complianceOn: cc.enabled, address: cc.address, domainVerified: emailDomainVerified() });
}

/** SMS send-readiness, synchronous (no network). */
export function smsSendReadiness(): ChannelReadiness {
  const cc = complianceConfig();
  return smsReadiness({ live: channelStatus().sms.live, complianceOn: cc.enabled, a2pRegistered: smsA2pRegistered() });
}

/** Readiness for a single outbound message channel (email/sms), for the send gate. */
export function sendReadiness(channel: "email" | "sms", address?: string | null): ChannelReadiness {
  return channel === "email" ? emailSendReadiness(address) : smsSendReadiness();
}

export interface ChannelsReadiness {
  email: ChannelReadiness;
  sms: ChannelReadiness;
  voice: ChannelReadiness;
}

/** The whole-workspace channel readiness, including a live gateway ping for
 *  voice. One call feeds every channel-status surface. Never throws. */
export async function getChannelReadiness(opts?: { address?: string | null }): Promise<ChannelsReadiness> {
  const diag = await gatewayDiagnostics().catch(() => null);
  return {
    email: emailSendReadiness(opts?.address),
    sms: smsSendReadiness(),
    voice: voiceReadiness({
      live: channelStatus().voice.live,
      reachable: diag?.gateway ? diag.gateway.reachable : null,
      misdirected: Boolean(diag?.gateway?.misdirected),
      // Only a reachable gateway whose own phone trunk is wired can actually dial.
      placeable: diag?.gateway?.reachable ? Boolean(diag.gateway.twilio) : null,
    }),
  };
}
