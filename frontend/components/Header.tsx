"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BellOutlined,
  CloseOutlined,
  CreditCardOutlined,
  DownOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/lib/auth";
import { Locale, localeLabels, useI18n } from "@/lib/i18n";
import { NexusflowLogo } from "./QuadrantLogo";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";

const consolePaths = [
  "/dashboard", "/keys", "/billing", "/monitor", "/activity", "/settings",
  "/rate-limits", "/tickets", "/sub-accounts", "/demo-admin", "/playground",
];

export default function Header() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [consoleMenuOpen, setConsoleMenuOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menusRef = useRef<HTMLDivElement>(null);
  const inConsole = consolePaths.some((path) => pathname.startsWith(path));
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const mainNav = [
    { href: "/", label: "首页" },
    { href: "/models", label: t("navModels") },
    { href: "/playground", label: t("navPlayground") },
    { href: "/pricing", label: t("navPricing") },
    { href: "/docs", label: t("navDocs") },
  ];

  const loginHref = `/login?returnTo=${encodeURIComponent(pathname || "/dashboard")}`;
  const registerHref = `/login?tab=register&returnTo=${encodeURIComponent(pathname || "/dashboard")}`;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menusRef.current && !menusRef.current.contains(event.target as Node)) {
        setLocaleOpen(false);
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const syncConsoleMenu = (event: Event) => setConsoleMenuOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    window.addEventListener("nexusflow:console-menu-state", syncConsoleMenu);
    return () => window.removeEventListener("nexusflow:console-menu-state", syncConsoleMenu);
  }, []);

  const handleMobileToggle = () => {
    if (inConsole) {
      window.dispatchEvent(new CustomEvent("nexusflow:toggle-console-menu"));
      return;
    }
    setMobileMenuOpen((value) => !value);
  };

  return (
    <>
      <header className={`app-header nf-header ${inConsole ? "nf-header-console" : ""}`}>
        <div className="nf-header-brand">
          <button className="nf-header-mobile-toggle" onClick={handleMobileToggle} aria-label={inConsole ? (consoleMenuOpen ? "关闭控制台菜单" : "打开控制台菜单") : (mobileMenuOpen ? "关闭网站菜单" : "打开网站菜单")} aria-expanded={inConsole ? consoleMenuOpen : mobileMenuOpen} aria-controls={inConsole ? "console-sidebar" : "mobile-site-menu"}>
            {(inConsole ? consoleMenuOpen : mobileMenuOpen) ? <CloseOutlined /> : <MenuOutlined />}
          </button>
          <Link href="/" aria-label="NexusFlow 首页"><NexusflowLogo size={21} color="var(--text-primary)" /></Link>
        </div>

        <GlobalSearch authenticated={Boolean(user)} />

        <nav className="nf-header-nav" aria-label="网站导航">
          {mainNav.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} aria-current={isActive(item.href) ? "page" : undefined}>{item.label}</Link>
          ))}
        </nav>

        <div className="nf-header-actions" ref={menusRef}>
          <Link href="/status" className="nf-header-icon" aria-label="公开服务状态"><BellOutlined /></Link>
          <ThemeToggle compact />

          <div className="nf-header-popover-wrap">
            <button className="nf-header-icon" onClick={() => { setLocaleOpen((value) => !value); setUserMenuOpen(false); }} aria-label="切换语言" aria-haspopup="menu" aria-expanded={localeOpen}>
              <GlobalOutlined />
            </button>
            {localeOpen && (
              <div className="nf-header-menu nf-locale-menu" role="menu">
                {(["zh", "en"] as Locale[]).map((item) => (
                  <button key={item} className={locale === item ? "active" : ""} onClick={() => { setLocale(item); setLocaleOpen(false); }}>
                    {localeLabels[item]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!loading && user ? (
            <div className="nf-header-popover-wrap">
              <button className="nf-account-trigger" onClick={() => { setUserMenuOpen((value) => !value); setLocaleOpen(false); }} aria-expanded={userMenuOpen} aria-haspopup="menu">
                <span className="nf-account-avatar">{user.nickname.slice(0, 1)}</span>
                <span className="nf-account-name">{user.nickname}</span>
                <DownOutlined />
              </button>
              {userMenuOpen && (
                <div className="nf-header-menu nf-user-menu" role="menu">
                  <div className="nf-user-menu-meta"><strong>{user.nickname}</strong><span>{user.email || user.username || "NexusFlow 账户"}</span></div>
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)}><SettingOutlined />账户设置</Link>
                  <Link href="/billing" onClick={() => setUserMenuOpen(false)}><CreditCardOutlined />余额与账单</Link>
                  <button className="danger" onClick={async () => { await logout(); setUserMenuOpen(false); }}><LogoutOutlined />{t("logOut")}</button>
                </div>
              )}
            </div>
          ) : !loading ? (
            <div className="nf-auth-links">
              <Link href={loginHref}>{t("logIn")}</Link>
              <Link href={registerHref} className="primary">{t("signUp")}</Link>
            </div>
          ) : <span className="nf-header-loading" />}
        </div>
      </header>

      {mobileMenuOpen && !inConsole && (
        <div className="nf-mobile-site-menu" id="mobile-site-menu">
          <nav aria-label="移动端网站导航">
            {mainNav.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className={isActive(item.href) ? "active" : ""}>{item.label}</Link>)}
          </nav>
          {!user && <div className="nf-mobile-auth"><Link href={loginHref}>{t("logIn")}</Link><Link href={registerHref}>{t("signUp")}</Link></div>}
        </div>
      )}
    </>
  );
}
