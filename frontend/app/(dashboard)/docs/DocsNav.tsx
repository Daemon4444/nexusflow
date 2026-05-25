"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

/* ── 模型方列表：左侧栏只显示模型名，展开后显示子接口 ── */
interface ProviderItem {
  key: string;
  label: string;
  children: { href: string; label: string }[];
}

const providers: ProviderItem[] = [
  {
    key: "qwen",
    label: "通义千问",
    children: [
      { href: "/docs/models/qwen/intro", label: "模型介绍" },
      { href: "/docs/api/qwen", label: "对话补全" },
      { href: "/docs/api/qwen?tab=reasoning", label: "推理模型" },
      { href: "/docs/api/qwen?tab=multimodal", label: "多模态" },
      { href: "/docs/api/qwen?tab=coding", label: "编程模型" },
      { href: "/docs/api/embeddings", label: "文本向量" },
      { href: "/docs/api/images", label: "图像生成" },
      { href: "/docs/api/videos", label: "视频生成" },
    ],
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    children: [
      { href: "/docs/models/deepseek/intro", label: "模型介绍" },
      { href: "/docs/api/deepseek", label: "对话补全" },
      { href: "/docs/api/deepseek?tab=reasoning", label: "推理模型" },
    ],
  },
  {
    key: "happyhorse",
    label: "HappyHorse",
    children: [
      { href: "/docs/models/happyhorse", label: "模型介绍" },
      { href: "/docs/api/happyhorse", label: "API 用法" },
    ],
  },
  {
    key: "pixverse",
    label: "PixVerse (爱诗)",
    children: [
      { href: "/docs/models/pixverse/intro", label: "模型介绍" },
      { href: "/docs/api/pixverse?tab=t2v", label: "文生视频" },
      { href: "/docs/api/pixverse?tab=i2v", label: "图生视频（首帧）" },
      { href: "/docs/api/pixverse?tab=kf2v", label: "图生视频（首尾帧）" },
      { href: "/docs/api/pixverse?tab=r2v", label: "参考生视频" },
    ],
  },
  {
    key: "glm",
    label: "智谱AI (GLM)",
    children: [
      { href: "/docs/api/glm", label: "对话补全" },
    ],
  },
  {
    key: "kimi",
    label: "月之暗面 (Kimi)",
    children: [
      { href: "/docs/api/kimi", label: "对话补全" },
    ],
  },
  {
    key: "minimax",
    label: "MiniMax",
    children: [
      { href: "/docs/api/minimax", label: "对话补全" },
    ],
  },
];

const platformLinks = [
  { href: "/docs/principles", label: "平台优势" },
  { href: "/docs/multi-protocol", label: "三协议接入" },
  { href: "/docs/provider-routing", label: "供应商路由" },
  { href: "/docs/model-fallback", label: "模型降级" },
  { href: "/docs/api-keys", label: "API 密钥管理" },
];

const refLinks = [
  { href: "/docs/api/parameters", label: "参数矩阵" },
  { href: "/docs/api/tasks", label: "异步任务 API" },
  { href: "/docs/api/anthropic", label: "Anthropic Messages" },
  { href: "/docs/api/gemini", label: "Gemini 协议" },
  { href: "/docs/api/errors", label: "错误码" },
  { href: "/docs/api/limits", label: "限流说明" },
  { href: "/docs/faq", label: "常见问题" },
];

/* ── 箭头 SVG ── */
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

/* ── 单个模型方折叠项 ── */
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

  // 只有一个子项时直接作为链接
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

/* ── 内部导航组件（需要 useSearchParams） ── */
function DocsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  return (
    <>
      {/* 顶部快速入口 */}
      <div style={{ padding: "20px 16px 12px" }}>
        <Link href="/docs" style={{ textDecoration: "none" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            API 文档
          </div>
        </Link>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
          nexusflow Documentation
        </div>
      </div>

      <nav style={{ padding: "0 10px 24px" }}>
        {/* 快速开始 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            开始
          </div>
          {[
            { href: "/docs", label: "概览" },
            { href: "/docs/quickstart", label: "快速开始" },
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

        {/* 平台功能 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            平台功能
          </div>
          {platformLinks.map((item) => {
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

        {/* 模型方列表 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            模型方
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {providers.map((p) => (
              <ProviderSection key={p.key} provider={p} pathname={pathname} fullUrl={fullUrl} />
            ))}
          </div>
        </div>

        {/* 参考 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 10px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            参考
          </div>
          {refLinks.map((item) => {
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

      {/* Playground 链接 */}
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
          打开 Playground
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
