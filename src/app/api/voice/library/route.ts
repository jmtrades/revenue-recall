import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { elevenConfigured, listElevenVoices } from "@/lib/voice/eleven";
import { getOrgSettings } from "@/lib/org";
import { voiceCanFix } from "@/lib/voice/diagnostic";

export const dynamic = "force-dynamic";

/**
 * ElevenLabs voice library for the hosted read-aloud voice. Session-gated by the
 * middleware; live-AI entitlement applies (previewing/using a voice spends
 * provider money). Self-gating: when ElevenLabs isn't configured (or the plan
 * isn't entitled) it reports `configured:false` and the UI hides itself — no
 * dead surface on a free or unconfigured deploy.
 */
export const GET = withGuard(async () => {
  // Only people who can fix it (owner/admin, or anyone in the open demo) get the
  // diagnostic + env hints; reps just see nothing.
  const canFix = await voiceCanFix();
  if (!elevenConfigured()) {
    return NextResponse.json({ configured: false, reason: "no_key", canFix, voices: [], selected: null, settings: null });
  }
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ configured: false, reason: "not_entitled", canFix, voices: [], selected: null, settings: null });
  }
  try {
    const [voices, org] = await Promise.all([
      listElevenVoices(),
      getOrgSettings().catch(() => null),
    ]);
    return NextResponse.json({ configured: true, reason: "ok", canFix, voices, selected: org?.ttsVoiceId ?? null, settings: org?.voiceSettings ?? null });
  } catch (e) {
    // Key is set but the provider rejected/failed the call (bad key, network,
    // rate limit). Surface the real reason so it's fixable.
    return NextResponse.json(
      { configured: false, reason: "error", canFix, voices: [], selected: null, settings: null, error: e instanceof Error ? e.message : "Could not reach ElevenLabs" },
      { status: 200 },
    );
  }
});
