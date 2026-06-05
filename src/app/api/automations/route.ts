import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";
import { effectiveAutomations, AUTOMATIONS } from "@/lib/automations";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** This org's automations, with its saved enable overrides applied. */
export const GET = withGuard(async () => {
  const org = await getOrgSettings();
  return NextResponse.json({ automations: effectiveAutomations(org.industryId, org.automations) });
});

const Body = z.object({ id: z.string().min(1).max(64), enabled: z.boolean() });

/** Persist a single automation's on/off for this org (so it survives a refresh
 *  and acts as a master switch the engine respects). */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "automations").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!AUTOMATIONS.some((a) => a.id === parsed.data.id)) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
  try {
    const org = await getOrgSettings();
    const next = { ...org.automations, [parsed.data.id]: parsed.data.enabled };
    const updated = await updateOrgSettings({ automations: next });
    return NextResponse.json({ ok: true, automations: updated.automations });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save — needs a connected database." }, { status: 502 });
  }
});
