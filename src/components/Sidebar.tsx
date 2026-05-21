import Link from "next/link";
import { NavLinks } from "@/components/nav";

export function Sidebar({ orgName, industryLabel }: { orgName: string; industryLabel: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <Link href="/dashboard" className="px-3 pb-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
          <span className="text-sm font-semibold text-white">Revenue Recall</span>
        </div>
        <p className="mt-3 truncate text-xs text-muted">{orgName}</p>
        <span className="pill mt-1 bg-brand-soft text-brand">{industryLabel}</span>
      </Link>
      <NavLinks />
      <div className="px-3 pt-4 text-[11px] leading-relaxed text-muted">Universal sales OS — works with any CRM, or none.</div>
    </aside>
  );
}
