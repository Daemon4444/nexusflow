"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const icons: Record<string, React.ReactNode> = {
  user: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  key: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  credit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  activity: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  monitor: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gauge: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></svg>,
  ticket: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 1 0 0-4V7a2 2 0 0 0-2-2H5z"/></svg>,
};

export default function UserSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const isActive = (href: string) => pathname === href;

  if (!user) return null;

  const sidebarNav = [
    {
      group: t("sidebarAccount"),
      items: [
        { href: "/settings", label: t("sidebarProfile"), icon: "user" },
        { href: "/keys", label: t("sidebarApiKeys"), icon: "key" },
        { href: "/billing", label: t("sidebarCredits"), icon: "credit" },
        { href: "/rate-limits", label: t("sidebarRateLimits"), icon: "gauge" },
        { href: "/tickets", label: t("sidebarTickets"), icon: "ticket" },
      ],
    },
    {
      group: t("sidebarAnalytics"),
      items: [
        { href: "/activity", label: t("sidebarActivity"), icon: "activity" },
        { href: "/monitor", label: t("sidebarPerformance"), icon: "monitor" },
      ],
    },
  ];

  return (
    <aside className="usr-sidebar">
      <div className="usr-sidebar-header">
        <h2 className="usr-sidebar-title">{t("sidebarTitle")}</h2>
      </div>
      <nav className="usr-sidebar-nav">
        {sidebarNav.map((group) => (
          <div key={group.group} className="usr-sidebar-group">
            <div className="usr-sidebar-group-label">{group.group}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`usr-sidebar-link ${isActive(item.href) ? "active" : ""}`}
              >
                <span className="usr-sidebar-icon">{icons[item.icon]}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="usr-sidebar-footer">
        <div className="usr-sidebar-user">
          <div className="usr-sidebar-avatar">
            {user.nickname.slice(0, 2)}
          </div>
          <div className="usr-sidebar-userinfo">
            <span className="usr-sidebar-username">{user.nickname}</span>
            <span className="usr-sidebar-email">{user.email}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
