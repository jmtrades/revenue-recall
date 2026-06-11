import Link from "next/link";
import { LogoBadge } from "@/components/Logo";
import { NavLinks } from "@/components/nav";

export function Sidebar({ orgName, industryLabel }: { orgName: string; industryLabel: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <Link href="/dashboard" className="px-3 pb-6">
        <div className="flex items-center gap-2.5">
          <LogoBadge box={32} />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </div>
        <p className="mt-3 truncate text-xs text-muted">{orgName}</p>
        <span className="pill mt-1 bg-brand-soft text-brand">{industryLabel}</span>
      </Link>
      <NavLinks />
      <div className="px-3 pt-4 text-[11px] leading-relaxed text-muted">Autonomous outbound — works with any CRM, or none.</div>
    </aside>
  );
}
