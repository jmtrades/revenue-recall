import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { convaiConfigured, convaiAgentId, convaiReason, getConvaiToken } from "@/lib/voice/convai";
import { elevenConfigured } from "@/lib/voice/eleven";
import { getOrgSettings } from "@/lib/org";
import { parseElevenSelection } from "@/lib/voice/eleven";
import { voiceCanFix } from "@/lib/voice/diagnostic";

export const dynamic = "force-dynamic";

/**
 * ElevenLabs Conversational AI session broker. Mirrors the hosted-TTS route:
 * session-gated by the middleware, and live-AI entitlement applies (this opens
 * a metered, real-time voice session). GET is the cheap probe the client uses
 * to decide whether to render the agent at all; POST mints the WebRTC
 * conversation token that authorizes the session — so an unconfigured or
 * free-plan deploy never even surfaces the agent.
 */

export const GET = withGuard(async () => {
  const entitled = await isEntitled("aiLive");
  const available = convaiConfigured() && entitled;
  // Surface WHY it's unavailable so an owner can fix it, not just see it
  // silently missing (mirrors the voice-library diagnostic). Reps just see the
  // agent hidden.
  const canFix = await voiceCanFix();
  const reason = convaiReason(elevenConfigured(), Boolean(convaiAgentId()), entitled);
  return NextResponse.json({ available, reason, canFix });
});

export const POST = withGuard(async () => {
  if (!convaiConfigured()) {
    return NextResponse.json({ error: "Voice agent not configured" }, { status: 503 });
  }
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ error: "The live voice agent is available on paid plans." }, { status: 403 });
  }
  try {
    const { token, agentId } = await getConvaiToken();
    // Speak the live agent in the org's chosen ElevenLabs voice (a stock voice
    // or the org's own clone), passed as a per-session override. Honored only if
    // the agent allows voice overrides in its ElevenLabs security settings;
    // otherwise the agent's configured voice is used — never an error.
    const org = await getOrgSettings().catch(() => null);
    const voiceId = parseElevenSelection(org?.ttsVoiceId) ?? undefined;
    return NextResponse.json({ token, agentId, voiceId }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start voice agent" }, { status: 502 });
  }
});
