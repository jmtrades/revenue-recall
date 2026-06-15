import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";
import { isIndustryId } from "@/lib/industries";
import { isLanguageCode } from "@/lib/languages";
import { ACCENT_KEYS, THEME_MODES } from "@/lib/theme";
import { requireRole } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getOrgSettings());
}

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  industryId: z.string().refine(isIndustryId, "Unknown industry").optional(),
  language: z.string().refine(isLanguageCode, "Unsupported language").optional(),
  monthlyQuota: z.number().nonnegative().max(1_000_000_000).optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
  theme: z.object({ accent: z.enum(ACCENT_KEYS).optional(), mode: z.enum(THEME_MODES).optional() }).optional(),
  compliance: z.object({ senderName: z.string().max(160).optional(), address: z.string().max(300).optional() }).optional(),
  // Accept any short string; updateOrgSettings stores it only if it's a real IANA
  // zone (else null). Not a strict refine, so an unrecognized browser-detected zone
  // from onboarding can't 400 the whole settings PATCH (dropping name/industry/etc.).
  timezone: z.string().max(64).optional(),
  // Global kill switch: pause/resume ALL autonomous sending.
  sendingPaused: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  // Org-wide settings (name, industry, compliance identity, quota) are an
  // owner/admin concern — a rep shouldn't be able to change them.
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  try {
    const settings = await updateOrgSettings(parsed.data);
    await recordAudit("org.settings_updated", Object.keys(parsed.data).join(", "));
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 409 });
  }
}
