import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
  const industry = getIndustry(cfg.industryId);
  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={cfg.orgName} industryLabel={industry.label} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName="You" orgName={cfg.orgName} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
