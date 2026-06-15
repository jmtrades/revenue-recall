import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { isEntitled } from "@/lib/billing/enforce";
import { aiRateLimit } from "@/lib/ratelimit";
import {
  cloneElevenVoice,
  deleteElevenVoice,
  elevenConfigured,
  elevenSelection,
  parseElevenSelection,
} from "@/lib/voice/eleven";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per sample
const MAX_FILES = 5;

/**
 * Create an ElevenLabs Instant Voice Clone from uploaded/recorded audio. Heavily
 * gated: owner/admin only, paid plan (it provisions a billable provider voice),
 * and rate-limited. The clone then appears in the voice library and can be set
 * as the org's read-aloud voice.
 */
export const POST = withGuard(async (req: Request) => {
  if (!elevenConfigured()) return NextResponse.json({ error: "Voice cloning isn't configured." }, { status: 503 });
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ error: "Voice cloning is available on paid plans." }, { status: 403 });
  }
  if (!(await aiRateLimit(req, "voice-clone")).ok) {
    return NextResponse.json({ error: "Too many requests — please wait a moment." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected an audio upload." }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  if (!name) return NextResponse.json({ error: "Give your voice a name." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Add at least one audio sample." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} samples.` }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Each sample must be under 10 MB." }, { status: 400 });
  }

  try {
    const voice = await cloneElevenVoice({ name, description: description || undefined, files });
    return NextResponse.json({ id: voice.id, name: voice.name, voiceId: elevenSelection(voice.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Cloning failed" }, { status: 502 });
  }
});

/** Delete one of the org's cloned voices (and clear it if it was the active one). */
export const DELETE = withGuard(async (req: Request) => {
  if (!elevenConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const raw = new URL(req.url).searchParams.get("voiceId") ?? "";
  const id = parseElevenSelection(raw.startsWith("eleven:") ? raw : elevenSelection(raw));
  if (!id) return NextResponse.json({ error: "Invalid voice id" }, { status: 400 });
  try {
    await deleteElevenVoice(id);
    // If the deleted voice was the org's selected read-aloud voice, clear it so
    // TTS falls back to the default rather than pointing at a now-missing voice.
    const org = await getOrgSettings().catch(() => null);
    if (org?.ttsVoiceId === elevenSelection(id)) await updateOrgSettings({ ttsVoiceId: "" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 502 });
  }
});
