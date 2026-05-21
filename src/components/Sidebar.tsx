"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/recall", label: "Revenue Recall", icon: "↺" },
  { href: "/pipeline", label: "Pipeline", icon: "▤" },
  { href: "/leads", label: "Leads", icon: "☷" },
  { href: "/sequences", label: "Sequences", icon: "⇉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ orgName, industryLabel }: { orgName: string; industryLabel: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <div className="px-3 pb-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
          <span className="text-sm font-semibold text-white">Revenue Recall</span>
        </div>
        <p className="mt-3 truncate text-xs text-muted">{orgName}</p>
        <span className="pill mt-1 bg-brand-soft text-brand">{industryLabel}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
              <span className="w-4 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pt-4 text-[11px] leading-relaxed text-muted">
        Universal sales OS — works with any CRM, or none.
      </div>
    </aside>
  );
}
