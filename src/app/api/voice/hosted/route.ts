import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { updateOrgSettings, getOrgSettings } from "@/lib/org";
import { elevenSelection, parseElevenSelection } from "@/lib/voice/eleven";

export const dynamic = "force-dynamic";

/** This org's current hosted (ElevenLabs) read-aloud voice. */
export const GET = withGuard(async () => {
  const org = await getOrgSettings().catch(() => null);
  return NextResponse.json({ voiceId: org?.ttsVoiceId ?? null });
});

// Accept a raw ElevenLabs voice id, an "eleven:<id>" selection, or "" to clear
// (fall back to the provider/account default).
const Body = z.object({ voiceId: z.string().max(80) });

/** Set the org's hosted read-aloud voice. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const raw = parsed.data.voiceId.trim();
  let ttsVoiceId = "";
  if (raw) {
    // Normalize a bare id into the stored "eleven:<id>" form, and validate it.
    const id = parseElevenSelection(raw.startsWith("eleven:") ? raw : elevenSelection(raw));
    if (!id) return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
    ttsVoiceId = elevenSelection(id);
  }
  try {
    const org = await updateOrgSettings({ ttsVoiceId });
    return NextResponse.json({ voiceId: org.ttsVoiceId ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
});
