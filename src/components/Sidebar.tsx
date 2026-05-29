import Link from "next/link";
import { NavLinks } from "@/components/nav";

export function Sidebar({ orgName, industryLabel }: { orgName: string; industryLabel: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <Link href="/dashboard" className="px-3 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">RR</span>
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
