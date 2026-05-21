import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";

export const metadata: Metadata = {
  title: "Revenue Recall — Universal Sales OS",
  description: "Recover slipping revenue and run your entire sales process — for any industry, with any CRM or none.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
  const industry = getIndustry(cfg.industryId);
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar orgName={cfg.orgName} industryLabel={industry.label} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar userName="You" />
            <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
