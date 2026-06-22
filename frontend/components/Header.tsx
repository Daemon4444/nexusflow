"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n, localeLabels } from "@/lib/i18n";
import { Locale } from "@/lib/i18n";
import { NexusflowLogo } from "./QuadrantLogo";
import { formatCny } from "@/lib/money";
import { useState, useRef, useEffect } from "react";

export default function Header() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileMenuOpen(false);
  }, [pathname]);

  const mainNav = [
    { href: "/models", label: t("navModels") },
    { href: "/playground", label: t("navPlayground") },
    { href: "/docs", label: t("navDocs") },
    { href: "/pricing", label: t("navPricing") },
  ];

  // Internal console navigation is handled by sidebar; top bar only keeps one Console entry to avoid duplicate navigation
  const userNav = [
    { href: "/dashboard", label: "Console" },
  ];
  const consolePaths = ["/dashboard", "/keys", "/billing", "/monitor", "/activity", "/settings", "/rate-limits", "/tickets"];
  const inConsole = consolePaths.some((p) => pathname.startsWith(p));

  return (
    <>
      <header className="app-header" style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        height: 56,
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", marginRight: 32, flexShrink: 0 }}>
          <NexusflowLogo size={15} color="var(--text-primary)" />
        </Link>

        {/* Main Nav - hidden on mobile */}
        <nav className="header-desktop-nav" style={{ display: "flex", alignItems: "center", gap: 1 }}>
          {mainNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 450,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  letterSpacing: "-0.1px",
                  transition: "color 0.15s, background 0.15s",
                  background: active ? "var(--accent-bg)" : "transparent",
                  position: "relative",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Section */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {/* Status indicator */}
          <Link href="/monitor" className="header-status" style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8, textDecoration: "none" }}>
            <div className="status-dot" />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t("online")}</span>
          </Link>

          {/* Language Switcher */}
          <div ref={langRef} style={{ position: "relative", marginRight: 8 }}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "transparent",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.12s",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {localeLabels[locale]}
            </button>
            {langOpen && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "var(--shadow-md)",
                padding: 4,
                minWidth: 100,
                zIndex: 200,
              }}>
                {(["zh", "en"] as Locale[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => { setLocale(l); setLangOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "7px 12px",
                      borderRadius: 5,
                      border: "none",
                      background: locale === l ? "var(--accent-bg)" : "transparent",
                      color: locale === l ? "var(--text-primary)" : "var(--text-secondary)",
                      fontSize: 12.5,
                      fontWeight: locale === l ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (locale !== l) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (locale !== l) e.currentTarget.style.background = "transparent"; }}
                  >
                    {localeLabels[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop user nav + auth */}
          <div className="header-desktop-user">
            {loading ? (
              <div style={{ width: 80, height: 32 }} />
            ) : user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Link
                  href="/dashboard"
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: inConsole ? 600 : 500,
                    color: inConsole ? "var(--text-primary)" : "var(--text-secondary)",
                    textDecoration: "none",
                    transition: "color 0.15s, background 0.15s",
                    background: inConsole ? "var(--accent-bg)" : "transparent",
                    border: inConsole ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  Console
                </Link>
                <Link
                  href="/billing"
                  title="Balance, click to view billing"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    marginLeft: 6,
                    padding: "4px 11px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  {formatCny(user.balance ?? 0)}
                </Link>
                <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, background: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
                  }}>
                    {user.nickname.slice(0, 2)}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                    {user.nickname}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  style={{
                    marginLeft: 8,
                    padding: "5px 12px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text-tertiary)",
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all 0.12s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger-border)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  {t("logOut")}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Link href="/login" style={{
                  padding: "6px 16px",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  textDecoration: "none",
                  fontWeight: 500,
                  borderRadius: 7,
                  transition: "color 0.15s",
                }}>
                  {t("logIn")}
                </Link>
                <Link href="/login" style={{
                  padding: "6px 18px",
                  background: "#111",
                  color: "#fff",
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}>
                  {t("signUp")}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger button */}
          <button
            className="header-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: "none",
              padding: 6,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
            aria-label="Toggle menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="header-mobile-menu" style={{
          position: "fixed",
          top: 56,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99,
          background: "rgba(255,255,255,0.98)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          overflowY: "auto",
          padding: "16px 20px",
          borderTop: "1px solid var(--border)",
          animation: "fadeIn 0.2s ease",
        }}>
          {/* Main nav links */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 0", marginBottom: 4 }}>Navigation</div>
            {mainNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "12px 10px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: active ? 600 : 450,
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    textDecoration: "none",
                    background: active ? "var(--accent-bg)" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User nav links */}
          {user && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 0", marginBottom: 4 }}>Account</div>
              {userNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "12px 10px",
                      borderRadius: 8,
                      fontSize: 15,
                      fontWeight: active ? 600 : 450,
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      textDecoration: "none",
                      background: active ? "var(--accent-bg)" : "transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* User info / auth */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "white",
                  }}>
                    {user.nickname.slice(0, 2)}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{user.nickname}</span>
                </div>
                <button
                  onClick={() => { logout(); setMobileMenuOpen(false); }}
                  style={{
                    padding: "7px 16px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    color: "var(--text-tertiary)",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t("logOut")}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <Link href="/login" style={{
                  flex: 1, textAlign: "center", padding: "11px 0",
                  color: "var(--text-secondary)", fontSize: 14, fontWeight: 500,
                  textDecoration: "none", border: "1px solid var(--border)", borderRadius: 8,
                }}>
                  {t("logIn")}
                </Link>
                <Link href="/login" style={{
                  flex: 1, textAlign: "center", padding: "11px 0",
                  background: "#111", color: "#fff", fontSize: 14, fontWeight: 500,
                  textDecoration: "none", borderRadius: 8,
                }}>
                  {t("signUp")}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
