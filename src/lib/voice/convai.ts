/**
 * ElevenLabs Conversational AI — the live, two-way voice-agent path (distinct
 * from the one-shot TTS in tts.ts). The browser talks to the agent over WebRTC
 * via @elevenlabs/react's useConversation hook; this server module mints the
 * short-lived CONVERSATION TOKEN that authorizes that session so the API key
 * never reaches the client.
 *
 * Like every other provider here it's inert until configured: it needs BOTH the
 * account key (ELEVENLABS_API_KEY, shared with TTS) and an agent to talk to
 * (ELEVENLABS_AGENT_ID, created in the ElevenLabs dashboard). With either unset
 * the feature reports unavailable and the UI simply doesn't render it.
 */

import { elevenClient, elevenSdkError } from "@/lib/voice/eleven-client";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** The Conversational AI agent the client connects to (dashboard → Agents). */
export function convaiAgentId(): string | undefined {
  return env("ELEVENLABS_AGENT_ID");
}

/** Configured only when we can both authenticate (key) and route to an agent. */
export function convaiConfigured(): boolean {
  return Boolean(env("ELEVENLABS_API_KEY") && convaiAgentId());
}

/**
 * Why the live agent isn't usable, from the three inputs that gate it. Pure so
 * it's unit-tested without env, and shared by the route's diagnostic. Order
 * matches the fix order an owner follows: add the key, then the agent id, then
 * upgrade the plan.
 */
export type ConvaiReason = "no_key" | "no_agent" | "not_entitled" | "ok";
export function convaiReason(hasKey: boolean, hasAgent: boolean, entitled: boolean): ConvaiReason {
  if (!hasKey) return "no_key";
  if (!hasAgent) return "no_agent";
  if (!entitled) return "not_entitled";
  return "ok";
}

/**
 * Mint a short-lived WebRTC conversation token the browser uses to open the
 * agent session. Keeps ELEVENLABS_API_KEY server-side; the client only ever
 * sees the token. Throws when unconfigured or the provider errors — the route
 * maps that to a clean JSON error and the client falls back to "unavailable".
 */
export async function getConvaiToken(): Promise<{ token: string; agentId: string }> {
  const client = elevenClient();
  const agentId = convaiAgentId();
  if (!client || !agentId) throw new Error("ElevenLabs Conversational AI not configured");

  let data;
  try {
    data = await client.conversationalAi.conversations.getWebrtcToken({ agentId });
  } catch (e) {
    throw new Error(elevenSdkError("ElevenLabs token", e));
  }
  if (!data.token) throw new Error("ElevenLabs token: missing token");
  return { token: data.token, agentId };
}
