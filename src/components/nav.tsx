"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

export const NAV_GROUPS: { heading: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    heading: "Sell",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/recall", label: "Revenue Recall", icon: "recall" },
      { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
      { href: "/leads", label: "Leads", icon: "leads" },
    ],
  },
  {
    heading: "Work",
    items: [
      { href: "/tasks", label: "Tasks", icon: "tasks" },
      { href: "/approvals", label: "Approvals", icon: "approvals" },
      { href: "/inbox", label: "Inbox", icon: "inbox" },
      { href: "/dialer", label: "Power Dialer", icon: "dialer" },
      { href: "/calendar", label: "Calendar", icon: "calendar" },
      { href: "/meetings", label: "Meetings", icon: "approvals" },
    ],
  },
  {
    heading: "Engage",
    items: [
      { href: "/agents", label: "Autopilot", icon: "autopilot" },
      { href: "/sequences", label: "Sequences", icon: "sequences" },
      { href: "/templates", label: "Templates", icon: "templates" },
      { href: "/automations", label: "Automations", icon: "automations" },
    ],
  },
  {
    heading: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/forecast", label: "Forecast", icon: "forecast" },
    ],
  },
];

export function NavLinks({ onNavigate, showAdmin = false }: { onNavigate?: () => void; showAdmin?: boolean }) {
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
                  <Icon name={item.icon} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5">
        {showAdmin && (
          <Link href="/admin" onClick={onNavigate} className={`nav-link ${pathname.startsWith("/admin") ? "nav-link-active" : ""}`}>
            <Icon name="shield" className="shrink-0" />
            Admin
          </Link>
        )}
        <Link href="/settings" onClick={onNavigate} className={`nav-link ${pathname.startsWith("/settings") ? "nav-link-active" : ""}`}>
          <Icon name="settings" className="shrink-0" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
