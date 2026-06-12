"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

/* ── Provider list: sidebar shows provider name, expands to show child endpoints ── */
interface ProviderItem {
  key: string;
  label: string;
  children: { href: string; label: string }[];
}

const providers: ProviderItem[] = [
  {
    key: "qwen",
    label: "Qwen",
    children: [
      { href: "/docs/models/qwen/intro", label: "Introduction" },
      { href: "/docs/api/qwen", label: "Chat Completions" },
      { href: "/docs/api/qwen?tab=reasoning", label: "Reasoning Models" },
      { href: "/docs/api/qwen?tab=multimodal", label: "Multimodal" },
      { href: "/docs/api/qwen?tab=coding", label: "Coding Models" },
      { href: "/docs/api/embeddings", label: "Text Embeddings" },
      { href: "/docs/api/images", label: "Image Generation" },
      { href: "/docs/api/videos", label: "Video Generation" },
    ],
  },
  {
    key: "claude",
    label: "Claude (Anthropic)",
    children: [
      { href: "/docs/models/claude", label: "Introduction" },
      { href: "/docs/api/anthropic", label: "Messages API" },
    ],
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    children: [
      { href: "/docs/models/deepseek/intro", label: "Introduction" },
      { href: "/docs/api/deepseek", label: "Chat Completions" },
      { href: "/docs/api/deepseek?tab=reasoning", label: "Reasoning Models" },
    ],
  },
  {
    key: "happyhorse",
    label: "HappyHorse",
    children: [
      { href: "/docs/models/happyhorse", label: "Introduction" },
      { href: "/docs/api/happyhorse", label: "API Usage" },
    ],
  },
  {
    key: "pixverse",
    label: "PixVerse",
    children: [
      { href: "/docs/models/pixverse/intro", label: "Introduction" },
      { href: "/docs/api/pixverse?tab=t2v", label: "Text-to-Video" },
      { href: "/docs/api/pixverse?tab=i2v", label: "Image-to-Video (First Frame)" },
      { href: "/docs/api/pixverse?tab=kf2v", label: "Image-to-Video (First & Last Frame)" },
      { href: "/docs/api/pixverse?tab=r2v", label: "Reference-to-Video" },
    ],
  },
  {
    key: "glm",
    label: "Zhipu AI (GLM)",
    children: [
      { href: "/docs/api/glm", label: "Chat Completions" },
    ],
  },
  {
    key: "kimi",
    label: "Moonshot (Kimi)",
    children: [
      { href: "/docs/api/kimi", label: "Chat Completions" },
    ],
  },
  {
    key: "minimax",
    label: "MiniMax",
    children: [
      { href: "/docs/api/minimax", label: "Chat Completions" },
    ],
  },
];

const apiRefLinks = [
  { href: "/docs/api/chat", label: "Chat Completions" },
  { href: "/docs/context-cache", label: "Context Cache" },
  { href: "/docs/api/parameters", label: "Parameter Reference" },
  { href: "/docs/api/cache", label: "Context Cache" },
  { href: "/docs/api/embeddings", label: "Embeddings" },
  { href: "/docs/api/tasks", label: "Async Tasks (Image/Video)" },
  { href: "/docs/api/anthropic", label: "Anthropic Messages" },
  { href: "/docs/api/gemini", label: "Gemini GenerateContent" },
  { href: "/docs/api/errors", label: "Error Codes" },
  { href: "/docs/api/limits", label: "Rate Limits" },
];

const platformLinks = [
  { href: "/docs/multi-protocol", label: "Multi-Protocol Support" },
  { href: "/docs/provider-routing", label: "Smart Routing" },
  { href: "/docs/model-fallback", label: "Model Fallback", tag: "Coming Soon" },
  { href: "/docs/api-keys", label: "API Key Management" },
  { href: "/docs/principles", label: "Platform Advantages" },
];

const helpLinks = [
  { href: "/docs/faq", label: "FAQ" },
];

/* ── Arrow SVG ── */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: "transform 0.2s",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ── Single provider collapsible section ── */
function ProviderSection({
  provider,
  pathname,
  fullUrl,
}: {
  provider: ProviderItem;
  pathname: string;
  fullUrl: string;
}) {
  const isAnyChildActive = provider.children.some(
    (c) => fullUrl === c.href || pathname === c.href.split("?")[0]
  );
  const [open, setOpen] = useState(isAnyChildActive);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAnyChildActive) setOpen(true);
  }, [isAnyChildActive]);

  // When there is only one child, render as a direct link
  if (provider.children.length === 1) {
    const child = provider.children[0];
    const isActive = fullUrl === child.href || pathname === child.href.split("?")[0];
    return (
      <Link
        href={child.href}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          fontSize: 13,
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: isActive ? 600 : 400,
          textDecoration: "none",
          borderRadius: 6,
          background: isActive ? "var(--bg-elevated)" : "transparent",
          transition: "all 0.15s",
        }}
      >
        {provider.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: isAnyChildActive ? 600 : 400,
          color: isAnyChildActive ? "var(--text-primary)" : "var(--text-secondary)",
          background: "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.15s",
        }}
      >
        {provider.label}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 16, marginTop: 2 }}>
          {provider.children.map((child) => {
            const isActive = fullUrl === child.href || pathname === child.href.split("?")[0];
            return (
              <Link
                key={child.href}
                href={child.href}
                style={{
                  display: "block",
                  padding: "6px 12px",
                  fontSize: 12,
                  color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  borderRadius: 4,
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Inner navigation component (requires useSearchParams) ── */
function DocsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  return (
    <>
      {/* Top quick entry */}
      <div style={{ padding: "20px 16px 12px" }}>
        <Link href="/docs" style={{ textDecoration: "none" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            API Documentation
          </div>
        </Link>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
          nexusflow Documentation
        </div>
      </div>

      <nav style={{ padding: "0 10px 24px" }}>
        {/* Getting Started */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            Getting Started
          </div>
          {[
            { href: "/docs", label: "Overview" },
            { href: "/docs/quickstart", label: "Quick Start" },
          ].map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  borderRadius: 6,
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* API Reference */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            API Reference
          </div>
          {apiRefLinks.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  borderRadius: 6,
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Models */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            Models
          </div>
          <Link
            href="/docs/models"
            style={{
              display: "block",
              padding: "8px 12px",
              fontSize: 13,
              color: pathname === "/docs/models" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: pathname === "/docs/models" ? 600 : 400,
              textDecoration: "none",
              borderRadius: 6,
              background: pathname === "/docs/models" ? "var(--bg-elevated)" : "transparent",
              transition: "all 0.15s",
            }}
          >
            Model Selection Guide
          </Link>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {providers.map((p) => (
              <ProviderSection key={p.key} provider={p} pathname={pathname} fullUrl={fullUrl} />
            ))}
          </div>
        </div>

        {/* Platform Capabilities */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            Platform Capabilities
          </div>
          {platformLinks.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  borderRadius: 6,
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
                {"tag" in item && item.tag && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                    {item.tag}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Help */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            Help
          </div>
          {helpLinks.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  borderRadius: 6,
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Playground link */}
      <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
        <Link
          href="/playground"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--accent)",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            borderRadius: 8,
            textDecoration: "none",
            transition: "all 0.15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Open Playground
        </Link>
      </div>
    </>
  );
}

export default function DocsNavSidebar() {
  return (
    <Suspense fallback={null}>
      <DocsNav />
    </Suspense>
  );
}
