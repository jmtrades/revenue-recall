import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";

export const dynamic = "force-dynamic";

/** Liveness + capability probe for uptime checks and ops dashboards. */
export async function GET() {
  const cfg = getConfig();
  const ch = channelStatus();
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    industry: cfg.industryId,
    capabilities: {
      database: isSupabaseConfigured() ? "supabase" : "in-memory",
      ai: isAiConfigured() ? "live" : "templates",
      auth: cfg.authRequired ? "required" : "optional",
      email: ch.email.live,
      sms: ch.sms.live,
      voice: ch.voice.live,
    },
  });
}
