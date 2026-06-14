/**
 * ElevenLabs Conversational AI — the live, two-way voice-agent path (distinct
 * from the one-shot TTS in tts.ts). The browser talks to ElevenLabs over a
 * WebSocket via @elevenlabs/react's useConversation hook; this server module
 * mints the short-lived SIGNED URL that authorizes that socket so the API key
 * never reaches the client.
 *
 * Like every other provider here it's inert until configured: it needs BOTH the
 * account key (ELEVENLABS_API_KEY, shared with TTS) and an agent to talk to
 * (ELEVENLABS_AGENT_ID, created in the ElevenLabs dashboard). With either unset
 * the feature reports unavailable and the UI simply doesn't render it.
 */

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
 * Mint a short-lived signed URL the browser uses to open the agent WebSocket.
 * Keeps ELEVENLABS_API_KEY server-side; the client only ever sees the URL.
 * Throws when unconfigured or the provider errors — the route maps that to a
 * clean JSON error and the client falls back to "agent unavailable".
 */
export async function getConvaiSignedUrl(): Promise<string> {
  const key = env("ELEVENLABS_API_KEY");
  const agentId = convaiAgentId();
  if (!key || !agentId) throw new Error("ElevenLabs Conversational AI not configured");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": key }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`ElevenLabs signed-url ${res.status}`);
  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) throw new Error("ElevenLabs signed-url: missing url");
  return data.signed_url;
}
