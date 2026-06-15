import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { isEntitled } from "@/lib/billing/enforce";
import { aiRateLimit } from "@/lib/ratelimit";
import {
  addSharedElevenVoice,
  elevenConfigured,
  elevenSelection,
  listSharedElevenVoices,
} from "@/lib/voice/eleven";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Browse + add from the full public ElevenLabs library (thousands of voices),
 * not just the account's own. GET lists (optionally searched); POST adds a
 * chosen voice to the account so it then appears in /api/voice/library and is
 * selectable. Owner/admin only and entitlement-gated — adding a voice is a
 * billable provider action — and rate-limited.
 */
export const GET = withGuard(async (req: Request) => {
  if (!elevenConfigured()) {
    return NextResponse.json({ configured: false, reason: "no_key", voices: [] });
  }
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ configured: false, reason: "not_entitled", voices: [] });
  }
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "60");
  try {
    const voices = await listSharedElevenVoices({ search, limit: Number.isFinite(limit) ? limit : 30 });
    return NextResponse.json({ configured: true, reason: "ok", voices });
  } catch (e) {
    return NextResponse.json(
      { configured: false, reason: "error", voices: [], error: e instanceof Error ? e.message : "Could not reach ElevenLabs" },
      { status: 200 },
    );
  }
});

const AddBody = z.object({
  publicOwnerId: z.string().min(1).max(64),
  voiceId: z.string().min(1).max(64),
  name: z.string().max(80).optional(),
});

export const POST = withGuard(async (req: Request) => {
  if (!elevenConfigured()) return NextResponse.json({ error: "Voice library isn't configured." }, { status: 503 });
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ error: "Adding library voices is available on paid plans." }, { status: 403 });
  }
  if (!(await aiRateLimit(req, "voice-shared-add")).ok) {
    return NextResponse.json({ error: "Too many requests — please wait a moment." }, { status: 429 });
  }
  const parsed = AddBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const voice = await addSharedElevenVoice(parsed.data.publicOwnerId, parsed.data.voiceId, parsed.data.name ?? "");
    return NextResponse.json({ id: voice.id, name: voice.name, voiceId: elevenSelection(voice.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not add voice" }, { status: 502 });
  }
});
