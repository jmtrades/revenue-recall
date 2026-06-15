import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { elevenConfigured, listElevenVoices } from "@/lib/voice/eleven";
import { getOrgSettings } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * ElevenLabs voice library for the hosted read-aloud voice. Session-gated by the
 * middleware; live-AI entitlement applies (previewing/using a voice spends
 * provider money). Self-gating: when ElevenLabs isn't configured (or the plan
 * isn't entitled) it reports `configured:false` and the UI hides itself — no
 * dead surface on a free or unconfigured deploy.
 */
export const GET = withGuard(async () => {
  if (!elevenConfigured() || !(await isEntitled("aiLive"))) {
    return NextResponse.json({ configured: false, voices: [], selected: null });
  }
  try {
    const [voices, org] = await Promise.all([
      listElevenVoices(),
      getOrgSettings().catch(() => null),
    ]);
    return NextResponse.json({ configured: true, voices, selected: org?.ttsVoiceId ?? null, settings: org?.voiceSettings ?? null });
  } catch (e) {
    return NextResponse.json(
      { configured: true, voices: [], selected: null, error: e instanceof Error ? e.message : "Could not load voices" },
      { status: 502 },
    );
  }
});
