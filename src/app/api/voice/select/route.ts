import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";
import { isCallVoiceId } from "@/lib/voice/house";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** This org's current outbound call voice. */
export const GET = withGuard(async () => {
  const org = await getOrgSettings().catch(() => null);
  return NextResponse.json({ voiceId: org?.voiceId ?? null });
});

const Body = z.object({ voiceId: z.string().max(80) });

/** Set the org's outbound call voice (a house voice id, a "clone:<id>", or ""). */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const voiceId = parsed.data.voiceId.trim();
  if (voiceId && !isCallVoiceId(voiceId)) return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
  try {
    const org = await updateOrgSettings({ voiceId });
    return NextResponse.json({ voiceId: org.voiceId ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
});
