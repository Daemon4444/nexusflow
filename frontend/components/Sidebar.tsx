"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { formatCny } from "@/lib/money";
import { NexusflowLogo } from "./QuadrantLogo";

const navItems = [
  { href: "/models", label: "模型列表", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> },
  { href: "/docs", label: "API 文档", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: "/playground", label: "在线体验", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
];

const authNavItems = [
  { href: "/keys", label: "API 密钥", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> },
  { href: "/billing", label: "账单管理", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { href: "/activity", label: "使用统计", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { href: "/settings", label: "账户设置", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

// 仅主账号可见（docs/sub-accounts-spec.md §5）
const mainOnlyNavItems = [
  { href: "/sub-accounts", label: "子账号", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

const moreNavItems = [
  { href: "/provider", label: "供应商入驻", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> },
  { href: "/admin", label: "管理后台", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  { href: "/admin/inspector", label: "请求查看", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
];

function NavGroup({ label, items, isActive }: { label?: string; items: typeof navItems; isActive: (href: string) => boolean }) {
  return (
    <div style={{ marginBottom: 4 }}>
      {label && (
        <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.07em", padding: "8px 10px 4px", textTransform: "uppercase" }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}>
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sidebar-root">
      {/* Logo */}
      <div style={{ padding: "16px 14px 12px" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div className="sidebar-logo-box">
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1 }}>N</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--font-serif)", letterSpacing: "-0.2px" }}>
                nexusflow
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 0.5, letterSpacing: "0.04em" }}>AI Model Router</div>
            </div>
          </div>
        </Link>
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "0 0 8px" }} />

      {/* Nav */}
      <nav style={{ padding: "4px 10px", flex: 1, overflowY: "auto" }}>
        <NavGroup items={navItems} isActive={isActive} />

        {user && !loading && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
            <NavGroup
              label="账户"
              items={user.accountType === "sub" ? authNavItems : [...authNavItems, ...mainOnlyNavItems]}
              isActive={isActive}
            />
          </>
        )}

        <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
        <NavGroup items={moreNavItems} isActive={isActive} />
      </nav>

      {/* User / Login */}
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ height: 1, background: "var(--border)", marginBottom: 10 }} />
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "0 4px" }}>加载中...</div>
        ) : user ? (
          <div>
            <div className="sidebar-user-card">
              <div style={{
                width: 26, height: 26, borderRadius: 6, background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
              }}>
                {user.nickname.slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.nickname}
                </div>
                <div style={{ fontSize: 11, color: "var(--success)", marginTop: 1 }}>
                  {user.accountType === "sub"
                    ? user.quota?.limit != null
                      ? `限额 ${formatCny(Math.max(0, user.quota.limit - user.quota.used))}`
                      : "子账号"
                    : formatCny(user.balance)}
                </div>
              </div>
            </div>
            <button onClick={() => logout()} style={{
              width: "100%", padding: "6px 10px", background: "transparent",
              border: "1px solid var(--border)", borderRadius: 7,
              color: "var(--text-tertiary)", fontSize: 12, cursor: "pointer",
              transition: "all 0.12s", fontFamily: "inherit",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >退出登录</button>
          </div>
        ) : (
          <Link href="/login" className="sidebar-login-btn">登录 / 注册</Link>
        )}
      </div>

      {/* Status */}
      <div style={{ padding: "6px 14px 12px", display: "flex", alignItems: "center", gap: 7 }}>
        <div className="status-dot" />
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>系统运行中</span>
      </div>
    </aside>
  );
}
