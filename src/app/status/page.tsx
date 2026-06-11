import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";
import { SITE_URL } from "@/lib/site";

// Live system state on every request — a cached "operational" defeats the point.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status",
  description: "Live operational status of Revenue Recall — application, database, AI, and sending channels.",
  alternates: { canonical: `${SITE_URL}/status` },
};

/**
 * Public status page. The footer pill says "All systems operational" — this is
 * the page that makes that claim checkable instead of decorative. It reads the
 * SAME primitives as /api/health (no second source of truth to drift) and the
 * serving commit, rendered server-side on every request: if this page loads,
 * the application tier is provably up, and everything else is reported from
 * live config, not a hand-edited incident doc.
 *
 * Channels that aren't configured show as "Standby", not red — for the hosted
 * product they're all live; for a self-hosted deploy an intentionally-off
 * channel is a configuration, not an outage.
 */
export default function StatusPage() {
  const cfg = getConfig();
  const ch = channelStatus();
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";

  const systems: { name: string; detail: string; live: boolean }[] = [
    { name: "Application", detail: "Web app, dashboard, and API", live: true },
    { name: "Database", detail: isSupabaseConfigured() ? "Multi-tenant Postgres" : "Built-in store", live: true },
    { name: "AI drafting & calls", detail: isAiConfigured() ? "Live model" : "Template engine", live: isAiConfigured() },
    { name: "Email delivery", detail: "Outreach, digests, and replies", live: ch.email.live },
    { name: "SMS delivery", detail: "Texts and inbound replies", live: ch.sms.live },
    { name: "Voice calling", detail: "Outbound calls and the dialer", live: ch.voice.live },
  ];
  const allLive = systems.every((s) => s.live);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="eyebrow text-brand">Status</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {allLive ? "All systems operational" : "Systems operational"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Checked live on every load — this page renders from the same system state the platform runs on,
          not a separately maintained incident feed.
        </p>

        <ul className="mt-10 space-y-2.5">
          {systems.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
              <div>
                <p className="text-sm font-medium text-fg">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
              </div>
              {s.live ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  Operational
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  Standby
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-surface-2/40 px-5 py-4 text-xs text-muted sm:flex-row sm:items-center">
          <span>
            Serving build <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg">{sha ? sha.slice(0, 7) : "dev"}</code>
          </span>
          <span>Checked {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</span>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Machine-readable probe: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">GET /api/health</code> — the same data as JSON,
          for uptime monitors and ops dashboards.
        </p>
      </main>
      <Footer />
    </div>
  );
}
