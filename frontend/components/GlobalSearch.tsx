"use client";

import Link from "next/link";
import { SearchOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAPI } from "@/lib/api";
import type { ModelSummary } from "@/lib/models";

const publicItems = [
  { title: "模型目录", detail: "浏览模型、能力与可用状态", href: "/models", group: "页面" },
  { title: "价格", detail: "查看 Token、图片、视频和语音计费", href: "/pricing", group: "页面" },
  { title: "Playground", detail: "在线验证模型请求", href: "/playground", group: "页面" },
  { title: "开发者文档", detail: "快速开始、协议与参数", href: "/docs", group: "文档" },
  { title: "API 快速开始", detail: "创建第一个可运行请求", href: "/docs/quickstart", group: "文档" },
  { title: "服务状态", detail: "查看 NexusFlow 当前运行状态", href: "/status", group: "页面" },
];

const consoleItems = [
  { title: "API Keys", detail: "创建与管理访问凭据", href: "/keys", group: "控制台" },
  { title: "账单与充值", detail: "余额、流水与账单导出", href: "/billing", group: "控制台" },
  { title: "请求活动", detail: "查询调用状态和费用", href: "/activity", group: "控制台" },
  { title: "账户设置", detail: "安全与个人资料", href: "/settings", group: "控制台" },
];

export default function GlobalSearch({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    if (models.length > 0) return;
    const controller = new AbortController();
    fetchAPI("/api/models", { signal: controller.signal }).then((response) => {
      if (response.success && Array.isArray(response.data)) setModels(response.data);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [open, models.length]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pages = [...publicItems, ...(authenticated ? consoleItems : [])];
    const modelItems = models.map((model) => ({
      title: model.name,
      detail: `${model.provider} · ${model.id}`,
      href: `/models/${encodeURIComponent(model.id)}`,
      group: "模型",
    }));
    const all = [...pages, ...modelItems];
    if (!normalized) return all.slice(0, 10);
    return all.filter((item) => `${item.title} ${item.detail} ${item.group}`.toLowerCase().includes(normalized)).slice(0, 12);
  }, [authenticated, models, query]);

  return (
    <>
      <button type="button" className="nf-header-search" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">
        <SearchOutlined />
        <span>搜索模型、文档和设置</span>
        <kbd>⌘ K</kbd>
      </button>
      {open && (
        <div className="nf-search-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="nf-search-dialog" role="dialog" aria-modal="true" aria-label="全站搜索" onMouseDown={(event) => event.stopPropagation()}>
            <label className="nf-search-input">
              <SearchOutlined />
              <span className="sr-only">搜索</span>
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型、文档和控制台页面" />
              <kbd>Esc</kbd>
            </label>
            <div className="nf-search-results">
              {results.length > 0 ? results.map((item) => (
                <Link key={`${item.group}-${item.href}`} href={item.href} onClick={() => { setOpen(false); setQuery(""); }}>
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <em>{item.group}</em>
                </Link>
              )) : <p>没有找到匹配结果</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
