import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { convaiConfigured, getConvaiSignedUrl } from "@/lib/voice/convai";

export const dynamic = "force-dynamic";

/**
 * ElevenLabs Conversational AI session broker. Mirrors the hosted-TTS route:
 * session-gated by the middleware, and live-AI entitlement applies (this opens
 * a metered, real-time voice session). GET is the cheap probe the client uses
 * to decide whether to render the agent at all; POST mints the signed URL that
 * authorizes the WebSocket — so an unconfigured or free-plan deploy never even
 * surfaces the agent.
 */
export const GET = withGuard(async () => {
  const available = convaiConfigured() && (await isEntitled("aiLive"));
  return NextResponse.json({ available });
});

export const POST = withGuard(async () => {
  if (!convaiConfigured()) {
    return NextResponse.json({ error: "Voice agent not configured" }, { status: 503 });
  }
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ error: "The live voice agent is available on paid plans." }, { status: 403 });
  }
  try {
    const signedUrl = await getConvaiSignedUrl();
    return NextResponse.json({ signedUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start voice agent" }, { status: 502 });
  }
});
