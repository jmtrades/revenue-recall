import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { getOrgSettings } from "@/lib/org";
import { getVoiceAssignments, setVoiceAssignment } from "@/lib/voice/assignments";

export const dynamic = "force-dynamic";

export const GET = withGuard(async () => {
  const org = await getOrgSettings().catch(() => null);
  const assignments = await getVoiceAssignments(org?.id ?? "local");
  return NextResponse.json({ assignments });
});

const Body = z.object({
  kind: z.enum(["campaign", "webinar"]),
  id: z.string().min(1).max(80),
  voiceId: z.string().max(80).nullable(),
});

export const POST = withGuard(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Need a kind, an id, and a voice." }, { status: 400 });
  const org = await getOrgSettings().catch(() => null);
  const assignments = await setVoiceAssignment(org?.id ?? "local", parsed.data.kind, parsed.data.id, parsed.data.voiceId);
  return NextResponse.json({ assignments });
});
