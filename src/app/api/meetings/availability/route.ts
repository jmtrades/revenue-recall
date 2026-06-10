import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAvailability } from "@/lib/meetings/store";
import { isValidTimeZone } from "@/lib/tz";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import type { WeeklyWindows } from "@/lib/meetings/types";

export const dynamic = "force-dynamic";

/**
 * Save the org's weekly booking availability. Owner/admin only; org-scoped by the
 * store. Windows are validated as HH:MM, normalized to weekday keys 0–6, and any
 * inverted/empty window is dropped before persisting.
 */
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const Window = z.object({ start: z.string().regex(HHMM), end: z.string().regex(HHMM) });

const Body = z.object({
  timezone: z.string().trim().max(60).optional(),
  weekly: z.record(z.string(), z.array(Window).max(6)).optional(),
  slotMinutes: z.number().int().min(5).max(240),
  minNoticeMinutes: z.number().int().min(0).max(20_160), // ≤ 14 days
  horizonDays: z.number().int().min(1).max(90),
});

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const PUT = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "availability").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid availability." }, { status: 400 });
  const { timezone, weekly, slotMinutes, minNoticeMinutes, horizonDays } = parsed.data;

  if (timezone && !isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "That timezone isn't recognized." }, { status: 400 });
  }

  // Normalize to integer weekday keys 0–6 and drop inverted/empty windows.
  const normalized: WeeklyWindows = {};
  for (const [k, windows] of Object.entries(weekly ?? {})) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const valid = (windows ?? []).filter((w) => toMin(w.end) > toMin(w.start));
    if (valid.length) normalized[day] = valid;
  }

  try {
    await saveAvailability({ timezone: timezone ?? "", weekly: normalized, slotMinutes, minNoticeMinutes, horizonDays });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return /require a database|No active org/.test(msg)
      ? NextResponse.json({ error: "Scheduling needs a connected database." }, { status: 409 })
      : NextResponse.json({ error: msg }, { status: 409 });
  }
});
