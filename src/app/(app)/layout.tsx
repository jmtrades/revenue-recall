import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { SystemTheme } from "@/components/SystemTheme";
import { getIndustry } from "@/lib/industries";
import { getSessionUser } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org";
import { accentVars } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [org, user] = await Promise.all([getOrgSettings(), getSessionUser()]);
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
      <Sidebar orgName={org.name} industryLabel={industry.label} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={user?.name ?? "You"} userEmail={user?.email} signedIn={Boolean(user)} orgName={org.name} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
