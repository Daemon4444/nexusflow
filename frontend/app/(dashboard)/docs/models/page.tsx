"use client";

import Link from "next/link";

const modelCategories = [
  {
    name: "Seedance 专题",
    provider: "火山方舟",
    desc: "火山方舟豆包 Seedance 系列旗舰视频生成模型。系列最厉害的 Seedance 2.0 支持多模态参考生视频、4K HDR 10bit、有声视频与首尾帧控制，业界顶尖水平",
    href: "/docs/models/seedance",
    introHref: "/docs/models/seedance",
    models: ["seedance-2.0 旗舰版", "seedance-2.0-fast", "seedance-1.5-pro", "seedance-1.0-pro-fast"],
    color: "#7c3aed",
    tag: "旗舰",
  },
  {
    name: "通义千问系列",
    provider: "阿里云",
    desc: "阿里云自研大模型，当前重点展示 Qwen3.8、Qwen3.7、Qwen3.6 与 Qwen3.5 系列，支持视觉理解、智能体与超长上下文",
    href: "/docs/models/qwen",
    introHref: "/docs/models/qwen/intro",
    models: ["Qwen3.8 Max", "Qwen3.7 Max", "Qwen3.7 Flash", "Qwen3.6 Max Preview", "Qwen3.6 Plus", "Qwen3.5 Omni Plus", "Qwen3.5 Omni Flash", "Qwen3.5 Plus", "Qwen3.5 Flash"],
    color: "#7c3aed",
    tag: null,
  },
  {
    name: "Claude 系列",
    provider: "Anthropic via HiModels",
    desc: "七个稳定公共模型 ID 通过 HiModels 原生 Anthropic Messages 兼容上游接入；同步和流式 /v1/messages 已验证",
    href: "/docs/api/claude",
    introHref: "/docs/models/claude",
    models: ["Claude Sonnet 5", "Claude Opus 5", "Claude Fable 5", "Claude Opus 4.8", "Claude Opus 4.7", "Claude Sonnet 4.6", "Claude Haiku 4.5"],
    color: "#b45309",
    tag: "推荐",
  },
  {
    name: "DeepSeek 系列",
    provider: "DeepSeek",
    desc: "高性能推理与通用模型，代码能力突出，适合复杂任务和高并发场景",
    href: "/docs/models/deepseek",
    introHref: "/docs/models/deepseek/intro",
    models: ["DeepSeek V4 Pro", "DeepSeek V4 Pro 0813", "DeepSeek V4 Flash", "DeepSeek V4 Flash 0731", "DeepSeek R1", "DeepSeek V3.2"],
    color: "#0ea5e9",
    tag: "高性价比",
  },
  {
    name: "智谱 GLM 系列",
    provider: "智谱AI",
    desc: "国产领先大语言模型，通用能力全面，长上下文支持",
    href: "/docs/api/glm",
    introHref: "/docs/api/glm",
    models: ["GLM 5.2", "GLM 5.1", "GLM 5", "GLM 4.7"],
    color: "#059669",
    tag: null,
  },
  {
    name: "Kimi 系列",
    provider: "月之暗面",
    desc: "月之暗面旗下大模型，旗舰 K3 原生视觉理解+深度思考+百万上下文，强大的长文本理解和推理能力",
    href: "/docs/api/kimi",
    introHref: "/docs/api/kimi",
    models: ["Kimi K3", "Kimi K2.6", "Kimi K2.5"],
    color: "#6366f1",
    tag: "最新",
  },
  {
    name: "MiniMax 系列",
    provider: "MiniMax",
    desc: "MiniMax 大模型，M3 具备业界领先的 Coding 与 Agentic 能力和原生多模态，适合通用对话和内容创作",
    href: "/docs/api/minimax",
    introHref: "/docs/api/minimax",
    models: ["MiniMax M3", "MiniMax M2.5", "MiniMax M2.1"],
    color: "#ec4899",
    tag: null,
  },
  {
    name: "HappyHorse 专题",
    provider: "Alibaba",
    desc: "VBench 排名第一的视频生成模型，支持文生视频、图生视频，已通过 nexusflow 统一接入",
    href: "/docs/models/happyhorse",
    introHref: "/docs/models/happyhorse",
    models: ["happyhorse-1.0-t2v", "happyhorse-1.0-i2v", "happyhorse-1.0-r2v"],
    color: "#2563eb",
    tag: "最新",
  },
  {
    name: "PixVerse 视频模型",
    provider: "PixVerse",
    desc: "专业视频生成模型，支持文生视频、图生视频、首尾帧和参考生视频等多种能力",
    href: "/docs/models/pixverse",
    introHref: "/docs/models/pixverse/intro",
    models: ["PixVerse V6"],
    color: "#06b6d4",
    tag: null,
  },
];

const pricingTable = [
  { model: "qwen3.8-max", ctx: "1M", input: "¥12", output: "¥36", category: "旗舰" },
  { model: "qwen3.8-flash", ctx: "1M", input: "¥0.8", output: "¥2.7", category: "极速多模态" },
  { model: "qwen3.7-max", ctx: "1M", input: "¥12", output: "¥36", category: "旗舰" },
  { model: "qwen3.7-flash", ctx: "1M", input: "¥0.2", output: "¥0.8", category: "极速多模态" },
  { model: "qwen3.6-max-preview", ctx: "256K", input: "¥9", output: "¥54", category: "旗舰" },
  { model: "qwen3.6-plus", ctx: "1M", input: "¥2", output: "¥12", category: "均衡" },
  { model: "qwen3.5-plus", ctx: "1M", input: "¥0.8", output: "¥4.8", category: "均衡" },
  { model: "qwen3.5-flash", ctx: "1M", input: "¥0.2", output: "¥2", category: "极速" },
  { model: "claude-sonnet-5", ctx: "1M", input: "¥13.6", output: "¥68", category: "推荐" },
  { model: "claude-opus-5", ctx: "1M", input: "¥34", output: "¥170", category: "旗舰" },
  { model: "claude-fable-5", ctx: "1M", input: "¥68", output: "¥340", category: "高阶" },
  { model: "claude-opus-4-8", ctx: "1M", input: "¥34", output: "¥170", category: "旗舰" },
  { model: "claude-opus-4-7", ctx: "1M", input: "¥34", output: "¥170", category: "旗舰" },
  { model: "claude-sonnet-4-6", ctx: "1M", input: "¥20.4", output: "¥102", category: "均衡" },
  { model: "claude-haiku-4-5", ctx: "200K", input: "¥6.8", output: "¥34", category: "高速" },
  { model: "deepseek-v4-pro", ctx: "1M", input: "¥12", output: "¥24", category: "推理旗舰" },
  { model: "deepseek-v4-pro-0813", ctx: "1M", input: "¥9", output: "¥27", category: "0813 快照（闲时价待开放）" },
  { model: "deepseek-v4-flash", ctx: "1M", input: "¥1", output: "¥2", category: "高速轻量 MoE" },
  { model: "deepseek-v4.1-flash", ctx: "1M", input: "¥1", output: "¥4", category: "高速轻量 MoE（按闲时平价）" },
  { model: "deepseek-v4-flash-0731", ctx: "1M", input: "¥1", output: "¥2", category: "0731 固定快照" },
  { model: "deepseek-r1", ctx: "128K", input: "¥4", output: "¥16", category: "推理" },
  { model: "deepseek-v3.2", ctx: "128K", input: "¥2", output: "¥3", category: "通用" },
  { model: "glm-5.3", ctx: "1M", input: "¥8", output: "¥28", category: "新一代旗舰、三档深度思考" },
  { model: "glm-5.2", ctx: "1M", input: "¥8", output: "¥28", category: "长程旗舰" },
  { model: "glm-5.2-fast-preview", ctx: "1M", input: "¥16", output: "¥56", category: "高速" },
  { model: "glm-5.1", ctx: "198K", input: "¥6", output: "¥24", category: "旗舰" },
  { model: "glm-5", ctx: "198K", input: "¥4", output: "¥18", category: "均衡" },
  { model: "kimi-k3", ctx: "1M", input: "¥20", output: "¥100", category: "旗舰" },
  { model: "kimi-k2.7-code", ctx: "256K", input: "¥6.5", output: "¥27", category: "编程（文本/图片/视频输入）" },
  { model: "kimi/kimi-k2.7-code-highspeed", ctx: "256K", input: "¥13", output: "¥54", category: "编程高速版" },
  { model: "kimi-k2-thinking", ctx: "256K", input: "¥4", output: "¥16", category: "Agentic 思考" },
  { model: "kimi-k2.6", ctx: "256K", input: "¥6.5", output: "¥27", category: "推理" },
  { model: "kimi-k2.5", ctx: "256K", input: "¥4", output: "¥21", category: "均衡" },
  { model: "MiniMax/MiniMax-M3", ctx: "1M", input: "¥4.2", output: "¥16.8", category: "旗舰多模态" },
  { model: "MiniMax/MiniMax-M2.7", ctx: "192K", input: "¥2.1", output: "¥8.4", category: "思考模型" },
  { model: "MiniMax-M2.5", ctx: "192K", input: "¥2.1", output: "¥8.4", category: "均衡" },
];

export default function ModelsOverviewPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 12,
          letterSpacing: "-0.5px",
          fontFamily: "var(--font-serif)",
        }}>
          模型总览
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          nexusflow 整合了业界领先的大语言模型，按模型能力提供 OpenAI、Anthropic Messages、Responses API、Embeddings、Image Generations 和 Tasks 等公共接口。选择最适合您需求的模型。
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          协议总览
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/multi-protocol", title: "文本类模型", desc: "OpenAI Chat、Anthropic Messages、Responses API" },
            { href: "/docs/api/embeddings", title: "向量模型", desc: "OpenAI Embeddings" },
            { href: "/docs/api/async", title: "图像 / 视频", desc: "Image Generations 或 NexusFlow Tasks" },
          ].map((item) => (
            <Link key={item.title} href={item.href} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Model categories */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          模型系列
        </h2>
        <div style={{ display: "grid", gap: 16 }}>
          {modelCategories.map((cat) => (
            <div
              key={cat.name}
              style={{
                padding: 24,
                background: "var(--bg)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {cat.name}
                    </h3>
                    {cat.tag && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: cat.tag === "推荐" ? "var(--success-bg)" : cat.tag === "最新" ? "#dbeafe" : cat.tag === "旗舰" ? "#ede9fe" : "var(--warning-bg)",
                        color: cat.tag === "推荐" ? "var(--success)" : cat.tag === "最新" ? "#1d4ed8" : cat.tag === "旗舰" ? "#6d28d9" : "var(--warning)",
                        border: cat.tag === "推荐" ? "1px solid var(--success-border)" : cat.tag === "最新" ? "1px solid rgba(29,78,216,.16)" : cat.tag === "旗舰" ? "1px solid rgba(109,40,217,.18)" : "1px solid var(--warning-border)",
                      }}>
                        {cat.tag}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{cat.provider}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
                {cat.desc}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {cat.models.map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Link
                  href={cat.introHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 7,
                    background: cat.color,
                    color: "#fff",
                    textDecoration: "none",
                    transition: "opacity 0.2s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  模型介绍
                </Link>
                <Link
                  href={cat.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 7,
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    border: "1px solid var(--border)",
                    transition: "opacity 0.2s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  API 文档
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing comparison */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          价格对比
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 16 }}>
          价格单位：每百万 Token（CNY）
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入价格</th>
                <th style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出价格</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>定位</th>
              </tr>
            </thead>
            <tbody>
              {pricingTable.map((row, idx) => (
                <tr key={row.model} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{row.model}</code>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{row.ctx}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)" }}>{row.input}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)" }}>{row.output}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                    }}>
                      {row.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Selection guide */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          选型指南
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            {
              scenario: "复杂推理与编程",
              recommend: "Qwen3 Max",
              reason: "旗舰能力更均衡，适合复杂推理、代码生成和系统任务",
            },
            {
              scenario: "日常对话与创作",
              recommend: "Qwen3.5 Plus",
              reason: "性能与成本平衡，适合大多数在线对话与业务场景",
            },
            {
              scenario: "中文内容处理",
              recommend: "Qwen3.5 系列",
              reason: "中文理解和生成能力优秀，支持超长文本",
            },
            {
              scenario: "高性价比需求",
              recommend: "DeepSeek V3",
              reason: "开源模型，价格实惠，代码能力出色",
            },
          ].map((item) => (
            <div
              key={item.scenario}
              style={{
                padding: 20,
                background: "var(--bg-elevated)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 8 }}>
                {item.scenario}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
                {item.recommend}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {item.reason}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: 32,
        background: "var(--accent-bg)",
        borderRadius: 12,
        border: "1px solid var(--accent-border)",
        textAlign: "center",
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
          不确定选择哪个模型？
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          在 Playground 中免费试用各个模型，找到最适合您的方案。
        </p>
        <Link
          href="/playground"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          打开 Playground
        </Link>
      </section>
    </div>
  );
}
