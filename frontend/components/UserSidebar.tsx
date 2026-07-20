"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatCny } from "@/lib/money";
import { NexusflowLogo } from "./QuadrantLogo";
import ThemeToggle from "./ThemeToggle";

const icons: Record<string, React.ReactNode> = {
  dashboard: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  key:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  credit:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  activity:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  monitor:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gauge:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></svg>,
  ticket:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 1 0 0-4V7a2 2 0 0 0-2-2H5z"/></svg>,
  user:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  play:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l14 9-14 9V3z"/></svg>,
  team:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

export default function UserSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const isActive = (href: string) => href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  const quietDashboard = true;

  if (!user) return null;

  const isSub = user.accountType === "sub";

  const nav = [
    {
      group: t("sidebarAccount"),
      items: [
        { href: "/dashboard",   label: "概览",              icon: "dashboard" },
        { href: "/keys",        label: t("sidebarApiKeys"), icon: "key"       },
        { href: "/billing",     label: t("sidebarCredits"), icon: "credit"    },
        { href: "/playground",  label: t("navPlayground"),  icon: "play"      },
        { href: "/settings",    label: t("sidebarProfile"), icon: "user"      },
        { href: "/rate-limits", label: t("sidebarRateLimits"), icon: "gauge"  },
        { href: "/tickets",     label: t("sidebarTickets"), icon: "ticket"    },
        // 子账号管理：仅主账号可见（docs/sub-accounts-spec.md §5）
        ...(!isSub ? [{ href: "/sub-accounts", label: "子账号", icon: "team" }] : []),
      ],
    },
    {
      group: t("sidebarAnalytics"),
      items: [
        { href: "/activity", label: t("sidebarActivity"),    icon: "activity" },
        { href: "/monitor",  label: t("sidebarPerformance"), icon: "monitor"  },
      ],
    },
  ];

  return (
    <aside className="usr-sidebar">
      {/* Logo */}
      <div className="usr-sidebar-header">
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          {quietDashboard ? (
            <span className="quiet-sidebar-wordmark"><strong>nexus</strong>flow</span>
          ) : (
            <>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#0d9488,#2f81f7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1 }}>N</span>
              </div>
              <div>
                <div className="usr-sidebar-title">nexusflow</div>
                <div className="usr-sidebar-subtitle">AI Model Router</div>
              </div>
            </>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="usr-sidebar-nav" style={{ flex: 1, overflowY: "auto" }}>
        {nav.map((group) => (
          <div key={group.group} className="usr-sidebar-group">
            <div className="usr-sidebar-group-label">{group.group}</div>
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={`usr-sidebar-link ${isActive(item.href) ? "active" : ""}`}>
                <span className="usr-sidebar-icon">{icons[item.icon]}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="usr-sidebar-footer">
        {quietDashboard ? (
          isSub ? (
            <div className="quiet-sidebar-balance">
              <span>{user.quota?.limit != null ? "剩余额度" : "子账号"}</span>
              <strong>
                {user.quota?.limit != null
                  ? formatCny(Math.max(0, user.quota.limit - user.quota.used))
                  : "由主账号管理"}
              </strong>
            </div>
          ) : (
          <div className="quiet-sidebar-balance">
            <span>Balance</span>
            <strong>{formatCny(user.balance ?? 0)}</strong>
            <Link href="/billing">Add credit <span>＋</span></Link>
          </div>
          )
        ) : (
          <div className="usr-sidebar-user">
            <div className="usr-sidebar-avatar">{user.nickname.slice(0, 2)}</div>
            <div className="usr-sidebar-userinfo">
              <span className="usr-sidebar-username">{user.nickname}</span>
              <span className="usr-sidebar-balance">{formatCny(user.balance ?? 0)}</span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>主题</span>
          <ThemeToggle compact />
        </div>
      </div>
    </aside>
  );
}
