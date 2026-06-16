import { redirect } from "next/navigation";
import { PageHeader, Stat, Card } from "@/components/ui";
import { MembersList } from "@/components/MembersList";
import { TeamInvites } from "@/components/TeamInvites";
import { getSessionRole } from "@/lib/authz";
import { isAuthRequired, inviteOnlyEnabled } from "@/lib/config";
import { listMembers } from "@/lib/members-server";
import { listInvites } from "@/lib/invites-server";
import { getOrgSettings } from "@/lib/org";
import { channelStatus } from "@/lib/comms";
import { isAiConfigured } from "@/lib/ai/client";
import { billingConfigured } from "@/lib/billing/stripe";
import { ttsAvailable } from "@/lib/voice/tts";
import { convaiConfigured } from "@/lib/voice/convai";

export const metadata = { title: "Admin — Revenue Recall" };

// Authenticated, role-gated, and data-driven — must render per request so the
// owner/admin check always runs and team/status data is never statically cached.
export const dynamic = "force-dynamic";

/**
 * Owner control panel. A single back-office view — separate from the day-to-day
 * sales UI — where the owner (and admins, who have full access) oversee the
 * workspace: who has access, the access mode, and whether each system is live.
 * Gated to owner/admin; everyone else is bounced to their dashboard. Degrades
 * to open access when no auth backend is connected (the demo), like the rest
 * of the app.
 */
export default async function AdminPage() {
  const role = await getSessionRole();
  if (isAuthRequired() && role !== "owner" && role !== "admin") redirect("/dashboard");

  const [members, invites, org] = await Promise.all([listMembers(), listInvites(), getOrgSettings()]);
  const inviteOnly = inviteOnlyEnabled();

  // System health at a glance — each feature lights up only when its key/URL is
  // set, mirroring the product's inert-without-config behavior.
  const ch = channelStatus();
  const systems: { label: string; live: boolean }[] = [
    { label: "Email", live: ch.email.live },
    { label: "SMS", live: ch.sms.live },
    { label: "Phone calls", live: ch.voice.live },
    { label: "AI drafting", live: isAiConfigured() },
    { label: "Premium voice", live: ttsAvailable() },
    { label: "Live call agent", live: convaiConfigured() },
    { label: "Billing", live: billingConfigured() },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Your owner control panel — team, access, and system status in one place." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Workspace" value={org.name} icon="building" />
        <Stat label="People with access" value={String(members.length)} hint={invites.length ? `${invites.length} pending invite${invites.length === 1 ? "" : "s"}` : "No pending invites"} icon="leads" />
        <Stat label="Access mode" value={inviteOnly ? "Invite-only" : "Open signup"} tone={inviteOnly ? "success" : "warn"} icon="shield" />
        <Stat label="Your role" value={role ? role[0].toUpperCase() + role.slice(1) : "—"} icon="settings" />
      </div>

      <Card title="System status">
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-fg">{s.label}</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.live ? "text-success" : "text-muted"}`}>
                <span className={`h-2 w-2 rounded-full ${s.live ? "bg-success" : "bg-muted/40"}`} aria-hidden="true" />
                {s.live ? "Live" : "Not configured"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Access control">
        <p className="text-sm leading-relaxed text-muted">
          {inviteOnly ? (
            <>This workspace is <span className="font-semibold text-fg">invite-only</span>. New people can only get in if you invite them by email below — open self-signup is closed.</>
          ) : (
            <>This workspace currently allows <span className="font-semibold text-fg">open signup</span>. To lock it down so only you and people you invite can join, set <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">SIGNUP_INVITE_ONLY=true</code> in your deployment and redeploy.</>
          )}
        </p>
      </Card>

      <Card title="People">
        <MembersList initial={members} viewerRole={role} />
      </Card>

      <Card title="Invite teammates">
        <TeamInvites initial={invites} persisted={org.persisted} />
      </Card>
    </div>
  );
}
