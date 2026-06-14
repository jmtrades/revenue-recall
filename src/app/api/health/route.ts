import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";
import { ttsAvailable } from "@/lib/voice/tts";
import { convaiConfigured } from "@/lib/voice/convai";

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

  // Explicit, machine-readable launch verdict so a misconfigured production
  // deploy (e.g. auth left optional → anyone reaches the dashboard, no per-user
  // isolation) is loud, not silent. `blockers` must be empty to be launch-ready.
  const blockers: string[] = [];
  if (!isSupabaseConfigured()) blockers.push("No database connected (set SUPABASE_* env vars).");
  if (!cfg.authRequired) blockers.push("Auth is optional — connect a database (Supabase) and every user gets their own private workspace automatically, or set NEXT_PUBLIC_AUTH_REQUIRED=true to gate the built-in demo store.");
  // A connected database with no service-role key looks healthy but can't write:
  // new users' orgs are provisioned with the service-role client (it bypasses
  // RLS to create the first org/member), so without it every signup dead-ends.
  if (isSupabaseConfigured() && !process.env.SUPABASE_SERVICE_ROLE_KEY) blockers.push("Database connected without a service-role key — new accounts can't be provisioned (set SUPABASE_SERVICE_ROLE_KEY).");

  const warnings: string[] = [];
  if (!isAiConfigured()) warnings.push("AI is in template mode (set ANTHROPIC_API_KEY for live drafting).");
  if (!ch.email.live) warnings.push("Email sending is off (signup/invite/outreach emails only log).");

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
    launch: {
      ready: blockers.length === 0,
      blockers,
      warnings,
    },
  });
}
