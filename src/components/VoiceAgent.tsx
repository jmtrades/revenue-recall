"use client";

import { useCallback, useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Icon } from "@/components/icons";

/**
 * Live ElevenLabs Conversational AI agent — a real two-way spoken conversation
 * (the prospect talks, the agent listens and replies), as opposed to the
 * one-shot read-aloud TTS behind SpeakButton. It connects over WebRTC (low
 * latency) authorized by a short-lived conversation token minted server-side
 * (/api/voice/convai), so the ElevenLabs key never touches the browser.
 *
 * Self-gating, like every other voice surface: it probes GET /api/voice/convai
 * once and renders NOTHING unless the agent is both configured (key + agent id)
 * and entitled on the current plan — so an unconfigured or free deploy shows no
 * dead button.
 */
function VoiceAgentInner({ label, prompt, firstMessage }: { label: string; prompt?: string; firstMessage?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const conversation = useConversation({
    onError: (message: string) => setError(message || "Voice agent error."),
  });
  const { status, isSpeaking, startSession, endSession } = conversation;

  // End the session if the component unmounts mid-call (navigation, etc.).
  useEffect(() => () => endSession(), [endSession]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      // The agent can't hear without mic access; ask first so a denial is a
      // clear message, not a silent failed connection.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/voice/convai", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not start the voice agent.");
      }
      const { token, voiceId } = (await res.json()) as { token: string; voiceId?: string };
      // Tailor the live conversation to THIS scenario + the org's chosen voice.
      // Honored when the agent permits overrides in its ElevenLabs security
      // settings; otherwise the agent's own config is used (never an error).
      const agent: { prompt?: { prompt: string }; firstMessage?: string } = {};
      if (prompt) agent.prompt = { prompt };
      if (firstMessage) agent.firstMessage = firstMessage;
      const overrides: { tts?: { voiceId: string }; agent?: typeof agent } = {};
      if (voiceId) overrides.tts = { voiceId };
      if (agent.prompt || agent.firstMessage) overrides.agent = agent;
      await startSession({
        conversationToken: token,
        connectionType: "webrtc",
        ...(overrides.tts || overrides.agent ? { overrides } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the voice agent.");
    } finally {
      setStarting(false);
    }
  }, [startSession, prompt, firstMessage]);

  const connected = status === "connected";
  const connecting = status === "connecting" || starting;

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={connected ? () => endSession() : start}
        disabled={connecting}
        title={connected ? "End the conversation" : "Talk to the voice agent"}
        aria-label={connected ? "End conversation" : "Start conversation"}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
          connected
            ? "border-danger/40 text-danger hover:border-danger/60"
            : "border-border text-fg hover:border-brand/40"
        }`}
      >
        <Icon
          name={connected ? "stop" : "mic"}
          size={13}
          fill="currentColor"
          stroke="none"
          className={connected ? (isSpeaking ? "text-brand animate-pulse" : "text-danger") : "text-brand"}
        />
        {connecting ? "Connecting…" : connected ? (isSpeaking ? "Agent speaking…" : "Listening… (end)") : label}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function VoiceAgent({
  label = "Talk to agent",
  className = "",
  prompt,
  firstMessage,
}: {
  label?: string;
  className?: string;
  /** System-prompt override so the live agent role-plays THIS scenario. */
  prompt?: string;
  /** The agent's opening line, tailored to the scenario. */
  firstMessage?: string;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/voice/convai")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => {
        if (live) setAvailable(Boolean(j?.available));
      })
      .catch(() => {
        if (live) setAvailable(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!available) return null;

  return (
    <div className={className}>
      <ConversationProvider>
        <VoiceAgentInner label={label} prompt={prompt} firstMessage={firstMessage} />
      </ConversationProvider>
    </div>
  );
}
