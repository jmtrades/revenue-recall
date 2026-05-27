import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { AiUsageBanner } from "@/components/AiUsageBanner";
import { getIndustry } from "@/lib/industries";
import { getSessionUser } from "@/lib/auth";
import { getOrgSettings } from "@/lib/org";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [org, user] = await Promise.all([getOrgSettings(), getSessionUser()]);
  const industry = getIndustry(org.industryId);
  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={org.name} industryLabel={industry.label} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={user?.name ?? "You"} userEmail={user?.email} signedIn={Boolean(user)} orgName={org.name} />
        <AiUsageBanner />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
