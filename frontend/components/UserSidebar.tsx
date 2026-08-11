"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChartOutlined,
  CodeOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileTextOutlined,
  KeyOutlined,
  SlidersOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatCny } from "@/lib/money";

type NavItem = { href: string; label: string; icon: React.ReactNode };

export default function UserSidebar({ inert = false }: { inert?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user) return null;

  const isSub = user.accountType === "sub";
  const isActive = (href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  const primary: NavItem[] = [
    { href: "/dashboard", label: "概览", icon: <DashboardOutlined /> },
    { href: "/keys", label: t("sidebarApiKeys"), icon: <KeyOutlined /> },
    { href: "/playground", label: t("navPlayground"), icon: <CodeOutlined /> },
    { href: "/rate-limits", label: t("sidebarRateLimits"), icon: <SlidersOutlined /> },
    ...(!isSub ? [{ href: "/sub-accounts", label: "子账号", icon: <TeamOutlined /> }] : []),
    { href: "/activity", label: t("sidebarActivity"), icon: <BarChartOutlined /> },
    { href: "/monitor", label: t("sidebarPerformance"), icon: <ThunderboltOutlined /> },
    { href: "/tickets", label: t("sidebarTickets"), icon: <FileTextOutlined /> },
  ];
  const account: NavItem[] = [
    { href: "/settings", label: t("sidebarProfile"), icon: <UserOutlined /> },
    { href: "/billing", label: t("sidebarCredits"), icon: <CreditCardOutlined /> },
  ];

  const renderItems = (items: NavItem[]) => items.map((item) => (
    <Link key={`${item.href}-${item.label}`} href={item.href} onClick={() => window.dispatchEvent(new CustomEvent("nexusflow:close-console-menu"))} className={`usr-sidebar-link ${isActive(item.href) ? "active" : ""}`} aria-current={isActive(item.href) ? "page" : undefined}>
      <span className="usr-sidebar-icon">{item.icon}</span><span>{item.label}</span>
    </Link>
  ));

  const balanceLabel = isSub && user.quota?.limit != null ? "剩余额度" : isSub ? "子账号" : "可用额度";
  const balanceValue = isSub
    ? user.quota?.limit != null ? formatCny(Math.max(0, user.quota.limit - user.quota.used)) : "由主账号管理"
    : formatCny((user.balance ?? 0) + (user.creditBalance ?? 0));

  return (
    <aside className="usr-sidebar" id="console-sidebar" aria-label="控制台导航" aria-hidden={inert || undefined} inert={inert || undefined}>
      <div className="nf-workspace-select"><span className="nf-workspace-mark">N</span><span>默认工作区</span><small>单工作区</small></div>
      <nav className="usr-sidebar-nav">
        <div className="usr-sidebar-group">{renderItems(primary)}</div>
        <div className="usr-sidebar-group"><div className="usr-sidebar-group-label">账户</div>{renderItems(account)}</div>
      </nav>
      <div className="usr-sidebar-footer">
        <div className="quiet-sidebar-balance"><span>{balanceLabel}</span><strong>{balanceValue}</strong>{!isSub && <Link href="/billing">充值余额</Link>}</div>
      </div>
    </aside>
  );
}
