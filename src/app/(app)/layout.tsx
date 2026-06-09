import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { BillingBanner } from "@/components/BillingBanner";
import { SystemTheme } from "@/components/SystemTheme";
import { NeuralVoice } from "@/components/NeuralVoice";
import { getIndustry } from "@/lib/industries";
import { getSessionUser } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org";
import { accentVars } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Neither load may throw here — a layout throw escapes (app)/error.tsx to the
  // root error page. getOrgSettings degrades internally; guard the session too.
  const [org, user] = await Promise.all([getOrgSettings(), getSessionUser().catch(() => null)]);
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
      <Sidebar orgName={org.name} industryLabel={industry.label} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={user?.name ?? "You"} userEmail={user?.email} signedIn={Boolean(user)} orgName={org.name} />
        <BillingBanner />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
