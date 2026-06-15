import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";
import { ttsAvailable } from "@/lib/voice/tts";
import { convaiConfigured } from "@/lib/voice/convai";
import { launchStatus } from "@/lib/launch";

export const dynamic = "force-dynamic";

/** Liveness + capability probe for uptime checks and ops dashboards. */
export async function GET() {
  const cfg = getConfig();
  const ch = channelStatus();

  const capabilities = {
    database: isSupabaseConfigured() ? "supabase" : "in-memory",
    ai: isAiConfigured() ? "live" : "templates",
    auth: cfg.authRequired ? "required" : "optional",
    email: ch.email.live,
    sms: ch.sms.live,
    voice: ch.voice.live,
    // ElevenLabs surfaces: hosted read-aloud TTS, and the live two-way agent.
    voiceHosted: ttsAvailable(),
    voiceAgent: convaiConfigured(),
  };

  // Launch readiness — shared with the in-app LaunchBanner so they never drift.
  const { ready, blockers, warnings } = launchStatus();

  // Which build is actually serving. Vercel injects the commit SHA at build
  // time (GIT_COMMIT_SHA covers other hosts), so an outside probe can prove a
  // deploy shipped — a failed deploy keeps serving the previous build while
  // looking perfectly healthy on every other field (exactly how the Hobby-plan
  // cron rejection hid for days).
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";

  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    commit: sha ? sha.slice(0, 7) : "dev",
    industry: cfg.industryId,
    capabilities,
    launch: { ready, blockers, warnings },
  });
}
