"use client";

import Link from "next/link";
import BaseUrlDiff from "@/components/BaseUrlDiff";

const protocols = [
  { name: "OpenAI 兼容", endpoint: "/v1/chat/completions", href: "/docs/api/chat", desc: "默认推荐。官方 OpenAI SDK、绝大多数框架与工具调用开箱即用。" },
  { name: "Anthropic Messages", endpoint: "/v1/messages", href: "/docs/api/anthropic", desc: "复用 Anthropic SDK 与 Claude Code 风格客户端，请求格式不用改。" },
  { name: "Responses API", endpoint: "/v1/responses", href: "/docs/api/responses", desc: "函数工具与 previous_response_id 多轮上下文，适合 Agent 编排。" },
];

const map = [
  {
    title: "开始",
    links: [
      { href: "/docs/quickstart", label: "快速开始", hint: "第一个请求" },
      { href: "/docs/api-keys", label: "API 密钥管理" },
      { href: "/docs/models", label: "选型指南" },
      { href: "/docs/faq", label: "常见问题" },
    ],
  },
  {
    title: "API 参考",
    links: [
      { href: "/docs/api/chat", label: "Chat Completions" },
      { href: "/docs/api/anthropic", label: "Anthropic Messages" },
      { href: "/docs/api/responses", label: "Responses API" },
      { href: "/docs/api/parameters", label: "参数详解" },
      { href: "/docs/api/embeddings", label: "Embeddings" },
      { href: "/docs/api/tasks", label: "异步任务（图像 / 视频）" },
    ],
  },
  {
    title: "生产运行",
    links: [
      { href: "/docs/context-cache", label: "上下文缓存", hint: "省钱" },
      { href: "/docs/api/limits", label: "限流说明" },
      { href: "/docs/api/errors", label: "错误码" },
      { href: "/docs/model-fallback", label: "模型降级" },
    ],
  },
  {
    title: "平台",
    links: [
      { href: "/docs/multi-protocol", label: "多协议支持" },
      { href: "/docs/provider-routing", label: "智能路由" },
      { href: "/docs/principles", label: "平台优势" },
      { href: "/pricing", label: "价格与计费" },
    ],
  },
];

const endpoints = [
  { method: "POST", path: "/v1/chat/completions", desc: "对话补全" },
  { method: "POST", path: "/v1/messages", desc: "Anthropic Messages" },
  { method: "POST", path: "/v1/responses", desc: "Responses API" },
  { method: "POST", path: "/v1/embeddings", desc: "文本向量" },
  { method: "POST", path: "/v1/tasks", desc: "图像 / 视频异步任务" },
  { method: "GET", path: "/v1/tasks/:id", desc: "任务轮询" },
];

const families = [
  { name: "通义千问", href: "/docs/models/qwen/intro", note: "Qwen3.8 Max / Flash、VL、Coder、向量与万相" },
  { name: "DeepSeek", href: "/docs/models/deepseek/intro", note: "V4 Pro / Flash 与固定日期快照" },
  { name: "Claude", href: "/docs/models/claude", note: "Opus、Sonnet、Haiku，百万上下文" },
  { name: "GLM · Kimi · MiniMax", href: "/docs/api/glm", note: "长上下文与编程向开源旗舰" },
  { name: "Seedance", href: "/docs/models/seedance", note: "火山方舟视频生成，4K HDR" },
  { name: "PixVerse · HappyHorse", href: "/docs/models/pixverse/intro", note: "文生 / 图生 / 参考生视频" },
];

export default function DocsPage() {
  return (
    <div className="dh">
      <section className="dh-hero">
        <div className="dh-hero-copy">
          <span className="dh-eyebrow">开发者文档</span>
          <h1>换一个地址，<br />接入所有主流模型。</h1>
          <p>NexusFlow 兼容 OpenAI、Anthropic 与 Responses 三种协议。你现有的 SDK、提示词和工具调用都不用改，换个地址、换个 Key，就能在千问、DeepSeek、Claude、GLM 之间自由切换。</p>
          <div className="dh-actions">
            <Link href="/docs/quickstart" className="dh-btn-primary">五分钟快速开始</Link>
            <Link href="/docs/api/chat" className="dh-btn-ghost">API 参考 →</Link>
          </div>
        </div>

        <BaseUrlDiff />
      </section>

      <section className="dh-section">
        <header><h2>三种协议，一个 Key</h2><p>选你现有 SDK 对应的协议即可，同一个 Key 通用。</p></header>
        <div className="dh-protocols">
          {protocols.map((item) => (
            <Link key={item.name} href={item.href} className="dh-protocol">
              <strong>{item.name}</strong>
              <code>{item.endpoint}</code>
              <p>{item.desc}</p>
              <span className="dh-arrow">阅读文档 →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dh-section">
        <header><h2>全部文档</h2></header>
        <div className="dh-map">
          {map.map((column) => (
            <div key={column.title}>
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}{link.hint && <em>{link.hint}</em>}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="dh-section dh-split">
        <div>
          <header><h2>端点速查</h2></header>
          <ul className="dh-endpoints">
            {endpoints.map((item) => (
              <li key={item.path}>
                <span className={`dh-method is-${item.method.toLowerCase()}`}>{item.method}</span>
                <code>{item.path}</code>
                <span>{item.desc}</span>
              </li>
            ))}
          </ul>
          <p className="dh-base">Base URL <code>https://nexusflow.hk/v1</code> · 鉴权 <code>Authorization: Bearer sk-air-…</code></p>
        </div>
        <div>
          <header><h2>按模型阅读</h2></header>
          <ul className="dh-families">
            {families.map((item) => (
              <li key={item.name}>
                <Link href={item.href}><strong>{item.name}</strong><span>{item.note}</span></Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
