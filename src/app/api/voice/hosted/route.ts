import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { updateOrgSettings, getOrgSettings } from "@/lib/org";
import { elevenSelection, parseElevenSelection } from "@/lib/voice/eleven";

export const dynamic = "force-dynamic";

/** This org's current hosted (ElevenLabs) read-aloud voice + tuning. */
export const GET = withGuard(async () => {
  const org = await getOrgSettings().catch(() => null);
  return NextResponse.json({ voiceId: org?.ttsVoiceId ?? null, settings: org?.voiceSettings ?? null });
});

// Set the voice (a raw ElevenLabs id, an "eleven:<id>" selection, or "" to clear)
// and/or the tuning (rate + expressiveness). Every field is optional, so the same
// endpoint handles "pick a voice" and "adjust the sliders" independently.
const Body = z.object({
  voiceId: z.string().max(80).optional(),
  rate: z.number().min(0.7).max(1.2).optional(),
  expressiveness: z.number().min(0).max(1).optional(),
});

/** Set the org's hosted read-aloud voice and/or its speed + expressiveness. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const patch: { ttsVoiceId?: string; voiceSettings?: { rate?: number; expressiveness?: number } } = {};
  if (parsed.data.voiceId !== undefined) {
    const raw = parsed.data.voiceId.trim();
    if (raw) {
      const id = parseElevenSelection(raw.startsWith("eleven:") ? raw : elevenSelection(raw));
      if (!id) return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
      patch.ttsVoiceId = elevenSelection(id);
    } else {
      patch.ttsVoiceId = "";
    }
  }
  if (parsed.data.rate !== undefined || parsed.data.expressiveness !== undefined) {
    patch.voiceSettings = {};
    if (parsed.data.rate !== undefined) patch.voiceSettings.rate = parsed.data.rate;
    if (parsed.data.expressiveness !== undefined) patch.voiceSettings.expressiveness = parsed.data.expressiveness;
  }
  if (!("ttsVoiceId" in patch) && !("voiceSettings" in patch)) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  try {
    const org = await updateOrgSettings(patch);
    return NextResponse.json({ voiceId: org.ttsVoiceId ?? null, settings: org.voiceSettings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
});
