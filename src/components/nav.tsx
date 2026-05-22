"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_GROUPS: { heading: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    heading: "Sell",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "◧" },
      { href: "/recall", label: "Revenue Recall", icon: "↺" },
      { href: "/pipeline", label: "Pipeline", icon: "▤" },
      { href: "/leads", label: "Leads", icon: "☷" },
    ],
  },
  {
    heading: "Work",
    items: [
      { href: "/tasks", label: "Tasks", icon: "✓" },
      { href: "/approvals", label: "Approvals", icon: "☑" },
      { href: "/inbox", label: "Inbox", icon: "✉" },
      { href: "/dialer", label: "Power Dialer", icon: "☎" },
      { href: "/calendar", label: "Calendar", icon: "▦" },
    ],
  },
  {
    heading: "Engage",
    items: [
      { href: "/agents", label: "Autopilot", icon: "✦" },
      { href: "/sequences", label: "Sequences", icon: "⇉" },
      { href: "/templates", label: "Templates", icon: "❏" },
      { href: "/automations", label: "Automations", icon: "⚡" },
    ],
  },
  {
    heading: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: "▦" },
      { href: "/forecast", label: "Forecast", icon: "◴" },
    ],
  },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">{group.heading}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                  <span className="w-4 text-center text-base leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-auto">
        <Link href="/settings" onClick={onNavigate} className={`nav-link ${pathname.startsWith("/settings") ? "nav-link-active" : ""}`}>
          <span className="w-4 text-center text-base leading-none">⚙</span>
          Settings
        </Link>
      </div>
    </nav>
  );
}
