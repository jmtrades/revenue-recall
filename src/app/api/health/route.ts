import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";
import { ttsAvailable } from "@/lib/voice/tts";
import { convaiConfigured, convaiAgentId, convaiReason } from "@/lib/voice/convai";
import { elevenConfigured } from "@/lib/voice/eleven";
import { launchStatus } from "@/lib/launch";
import { isAdminRequest } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Liveness + capability probe for uptime checks and ops dashboards. */
export async function GET(req: Request) {
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

  // Voice connection detail — public (no session) so an operator can confirm the
  // premium voice is wired straight from /api/health, with the exact reason it's
  // not, mirroring the in-app diagnostic. Entitlement isn't checkable without a
  // session, so this reports CONFIG presence (key/agent) — which is the part an
  // env-var fix actually changes. White-labeled: no vendor name is exposed here.
  // `agentReason`: no_key | no_agent | ok.
  const voice = {
    hosted: ttsAvailable(),
    premiumVoice: elevenConfigured(),
    agent: convaiConfigured(),
    agentReason: convaiReason(elevenConfigured(), Boolean(convaiAgentId()), true),
  };

  // Launch readiness — shared with the in-app LaunchBanner so they never drift.
  const { ready, blockers, warnings } = launchStatus();
  // The detailed blocker/warning TEXT names env vars and specific setup gaps
  // ("domain isn't verified", "not A2P registered") — operator-internal. Keep the
  // verdict + counts public (enough for an uptime/status check), but only reveal
  // the text to a request carrying ADMIN_TOKEN, so a live deployment doesn't
  // broadcast its unfinished setup to the anonymous internet.
  const operator = isAdminRequest(req);

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
    voice,
    launch: operator
      ? { ready, blockers, warnings }
      : { ready, blockers: blockers.length, warnings: warnings.length },
  });
}
