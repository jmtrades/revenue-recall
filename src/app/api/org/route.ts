import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";
import { ACCENT_KEYS, THEME_MODES } from "@/lib/theme";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getOrgSettings());
}

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  monthlyQuota: z.number().nonnegative().max(1_000_000_000).optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
  theme: z.object({ accent: z.enum(ACCENT_KEYS).optional(), mode: z.enum(THEME_MODES).optional() }).optional(),
});

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  try {
    const settings = await updateOrgSettings(parsed.data);
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 409 });
  }
}
