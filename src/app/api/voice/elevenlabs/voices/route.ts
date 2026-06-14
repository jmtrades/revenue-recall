import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { listElevenVoices } from "@/lib/voice/tts";

export const dynamic = "force-dynamic";

/**
 * List the ElevenLabs voices available to this account — premade library voices
 * AND the operator's own cloned voices — so an owner/admin can discover the ids
 * to put in ELEVENLABS_VOICE_MAP (mapping any house voice to any ElevenLabs
 * voice) without leaving the product. Owner/admin only: it reveals the account's
 * voice roster and spends an upstream API call. Returns configured:false when
 * ElevenLabs isn't set up (the UI then shows nothing rather than erroring).
 */
export const GET = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const voices = await listElevenVoices();
  return NextResponse.json({ configured: voices.length > 0, voices });
});
