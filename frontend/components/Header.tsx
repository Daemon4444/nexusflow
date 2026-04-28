"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n, localeLabels } from "@/lib/i18n";
import { Locale } from "@/lib/i18n";
import { NexusflowLogo } from "./QuadrantLogo";
import { useState, useRef, useEffect } from "react";

export default function Header() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const mainNav = [
    { href: "/models", label: t("navModels") },
    { href: "/playground", label: t("navPlayground") },
    { href: "/docs", label: t("navDocs") },
    { href: "/pricing", label: t("navPricing") },
  ];

  const userNav = [
    { href: "/keys", label: t("navKeys") },
    { href: "/billing", label: t("navBilling") },
    { href: "/monitor", label: t("navMonitor") },
    { href: "/activity", label: t("navActivity") },
    { href: "/settings", label: t("navSettings") },
  ];

  return (
    <header style={{
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

      {/* Main Nav */}
      <nav style={{ display: "flex", alignItems: "center", gap: 1 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
          <div className="status-dot" />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t("online")}</span>
        </div>

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

        {loading ? (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "0 8px" }}>{t("loading")}</div>
        ) : user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* User nav links */}
            {userNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 450,
                    color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                    textDecoration: "none",
                    transition: "color 0.15s, background 0.15s",
                    background: active ? "var(--accent-bg)" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />

            {/* User avatar + name */}
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
    </header>
  );
}
