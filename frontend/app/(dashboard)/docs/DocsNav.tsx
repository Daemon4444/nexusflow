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
    key: "seedance",
    label: "Seedance (火山方舟)",
    children: [
      { href: "/docs/models/seedance", label: "模型介绍" },
      { href: "/docs/api/seedance", label: "API 用法" },
    ],
  },
  {
    key: "qwen",
    label: "通义千问",
    children: [
      { href: "/docs/models/qwen/intro", label: "模型介绍" },
      { href: "/docs/api/qwen", label: "对话补全" },
      { href: "/docs/api/qwen?tab=reasoning", label: "推理模型" },
      { href: "/docs/api/qwen?tab=multimodal", label: "多模态" },
      { href: "/docs/api/embeddings", label: "文本向量" },
      { href: "/docs/api/images", label: "图像生成" },
      { href: "/docs/api/videos", label: "视频生成" },
    ],
  },
  {
    key: "claude",
    label: "Claude (Anthropic)",
    children: [
      { href: "/docs/models/claude", label: "模型介绍" },
      { href: "/docs/api/anthropic", label: "Messages API" },
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

const apiProtocolLinks = [
  { href: "/docs/api/chat", label: "Chat Completions" },
  { href: "/docs/api/anthropic", label: "Anthropic Messages" },
  { href: "/docs/api/responses", label: "Responses API" },
];

const apiOtherLinks = [
  { href: "/docs/api/parameters", label: "参数详解" },
  { href: "/docs/api/embeddings", label: "Embeddings" },
  { href: "/docs/context-cache", label: "上下文缓存" },
  { href: "/docs/api/tasks", label: "异步任务 (图像/视频)" },
  { href: "/docs/api/errors", label: "错误码" },
  { href: "/docs/api/limits", label: "限流说明" },
];

const platformLinks = [
  { href: "/docs/multi-protocol", label: "多协议支持" },
  { href: "/docs/provider-routing", label: "智能路由" },
  { href: "/docs/api-keys", label: "API 密钥管理" },
  { href: "/docs/principles", label: "平台优势" },
];

const helpLinks = [
  { href: "/docs/faq", label: "常见问题" },
];

/* ── 单个模型方折叠项 ── */
function ProviderSection({ provider, fullUrl, pathname, filter }: { provider: ProviderItem; fullUrl: string; pathname: string; filter: string }) {
  const isAnyChildActive = provider.children.some((c) => fullUrl === c.href || pathname === c.href.split("?")[0]);
  const [open, setOpen] = useState(isAnyChildActive);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAnyChildActive) setOpen(true);
  }, [isAnyChildActive]);

  const children = filter ? provider.children.filter((c) => matches(`${provider.label} ${c.label}`, filter)) : provider.children;
  if (filter && children.length === 0 && !matches(provider.label, filter)) return null;
  const expanded = open || Boolean(filter);

  if (provider.children.length === 1) {
    const child = provider.children[0];
    return <Link href={child.href} className={`dn-link${fullUrl === child.href ? " is-active" : ""}`}>{provider.label}</Link>;
  }
  return (
    <div className={`dn-group${isAnyChildActive ? " has-active" : ""}`}>
      <button className="dn-link dn-toggle" aria-expanded={expanded} onClick={() => setOpen(!open)}>
        {provider.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><polyline points="9 6 15 12 9 18" /></svg>
      </button>
      {expanded && (
        <div className="dn-children">
          {(children.length ? children : provider.children).map((child) => (
            <Link key={child.href} href={child.href} className={`dn-sublink${fullUrl === child.href ? " is-active" : ""}`}>{child.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function matches(text: string, filter: string) {
  return text.toLowerCase().includes(filter.trim().toLowerCase());
}

/* ── 内部导航组件（需要 useSearchParams） ── */
function DocsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
  const [filter, setFilter] = useState("");

  const links = (items: { href: string; label: string }[], sub = false) => items
    .filter((item) => !filter || matches(item.label, filter))
    .map((item) => (
      <Link key={item.href} href={item.href} className={`${sub ? "dn-sublink" : "dn-link"}${pathname === item.href ? " is-active" : ""}`}>{item.label}</Link>
    ));

  const section = (title: string, body: React.ReactNode) => (
    <section className="dn-section">
      <h4>{title}</h4>
      {body}
    </section>
  );

  return (
    <div className="dn">
      <div className="dn-head">
        <Link href="/docs" className="dn-title">文档</Link>
        <label className="dn-filter">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="筛选目录" aria-label="筛选文档目录" />
        </label>
      </div>
      <nav className="dn-nav" aria-label="文档目录">
        {section("开始", links([{ href: "/docs", label: "概览" }, { href: "/docs/quickstart", label: "快速开始" }]))}
        {section("API 参考", (
          <>
            <div className="dn-caption">协议</div>
            {links(apiProtocolLinks)}
            <div className="dn-caption">通用</div>
            {links(apiOtherLinks)}
          </>
        ))}
        {section("模型", (
          <>
            {links([{ href: "/docs/models", label: "选型指南" }])}
            {providers.map((p) => <ProviderSection key={p.key} provider={p} fullUrl={fullUrl} pathname={pathname} filter={filter} />)}
          </>
        ))}
        {section("平台", links(platformLinks))}
        {section("帮助", links(helpLinks))}
      </nav>
    </div>
  );
}

export default function DocsNavSidebar() {
  return (
    <Suspense fallback={null}>
      <DocsNav />
    </Suspense>
  );
}
