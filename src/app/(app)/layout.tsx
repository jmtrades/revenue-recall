import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { BillingBanner } from "@/components/BillingBanner";
import { LaunchBanner } from "@/components/LaunchBanner";
import { SendingPausedBanner } from "@/components/SendingPause";
import { SystemTheme } from "@/components/SystemTheme";
import { NeuralVoice } from "@/components/NeuralVoice";
import { InviteRequired } from "@/components/InviteRequired";
import { getIndustry } from "@/lib/industries";
import { getSessionUser } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org";
import { inviteOnlyEnabled } from "@/lib/config";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { accentVars } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Neither load may throw here — a layout throw escapes (app)/error.tsx to the
  // root error page. getOrgSettings degrades internally; guard the session too.
  const [org, user] = await Promise.all([getOrgSettings(), getSessionUser().catch(() => null)]);

  // Invite-only deployment: a signed-in user with no workspace was never invited
  // (provisioning refused to bootstrap one). Show a clear dead-end instead of an
  // empty app shell. Only runs when the flag is on, so open deployments are
  // untouched; real members always resolve to their org and never see this.
  if (user && inviteOnlyEnabled()) {
    const orgId = await resolveActiveOrgId().catch(() => null);
    if (!orgId) return <InviteRequired email={user.email} />;
  }
  const industry = getIndustry(org.industryId);
  const mode = org.theme.mode;
  return (
    <div
      id="app-shell"
      className="flex min-h-screen bg-bg text-body"
      style={accentVars(org.theme.accent)}
      data-theme={mode === "system" ? undefined : mode}
    >
      {mode === "system" && <SystemTheme />}
      <NeuralVoice />
      {/* Skip-to-content: keyboard/screen-reader users jump past the sidebar and
          top bar straight to the page (WCAG 2.4.1). Hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar orgName={org.name} industryLabel={industry.label} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={user?.name ?? "You"} userEmail={user?.email} signedIn={Boolean(user)} orgName={org.name} />
        <LaunchBanner />
        <SendingPausedBanner initialPaused={org.sendingPaused} />
        <BillingBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
