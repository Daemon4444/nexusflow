"use client";

import Link from "next/link";

const modelCategories = [
  {
    name: "通义千问系列",
    provider: "阿里云",
    desc: "阿里云自研大模型，当前重点展示 Qwen3.6 与 Qwen3.5 系列，中文能力优秀，支持超长上下文",
    href: "/docs/models/qwen",
    introHref: "/docs/models/qwen/intro",
    models: ["Qwen3.6 Max Preview", "Qwen3.6 Plus", "Qwen3.5 Plus", "Qwen3.5 Flash"],
    color: "#7c3aed",
    tag: null,
  },
  {
    name: "DeepSeek 系列",
    provider: "DeepSeek",
    desc: "高性能推理与通用模型，代码能力突出，适合复杂任务和高并发场景",
    href: "/docs/models/deepseek",
    introHref: "/docs/models/deepseek/intro",
    models: ["DeepSeek V4 Pro", "DeepSeek V4 Flash", "DeepSeek R1", "DeepSeek V3"],
    color: "#0ea5e9",
    tag: "高性价比",
  },
  {
    name: "HappyHorse 专题",
    provider: "Alibaba",
    desc: "VBench 排名第一的视频生成模型，支持文生视频、图生视频，已通过 nexusflow 统一接入",
    href: "/docs/models/happyhorse",
    introHref: "/docs/models/happyhorse",
    models: ["happyhorse-1.0", "文生视频", "图生视频"],
    color: "#2563eb",
    tag: "最新",
  },
  {
    name: "PixVerse 视频模型",
    provider: "PixVerse",
    desc: "专业视频生成模型，支持文生视频、图生视频、首尾帧和参考生视频等多种能力",
    href: "/docs/models/pixverse",
    introHref: "/docs/models/pixverse/intro",
    models: ["PixVerse V6", "PixVerse V4.5", "PixVerse V4"],
    color: "#06b6d4",
    tag: null,
  },
];

const pricingTable = [
  { model: "qwen3.6-max-preview", ctx: "262K", input: "¥9", output: "¥54", category: "旗舰" },
  { model: "qwen3.6-plus", ctx: "1M", input: "¥2", output: "¥12", category: "均衡" },
  { model: "qwen3.6-flash", ctx: "1M", input: "¥1.2", output: "¥7.2", category: "极速" },
  { model: "qwen3.5-plus", ctx: "1M", input: "¥0.8", output: "¥4.8", category: "均衡" },
  { model: "qwen3.5-flash", ctx: "1M", input: "¥0.2", output: "¥2", category: "极速" },
  { model: "deepseek-v4-pro", ctx: "1M", input: "¥12", output: "¥24", category: "推理旗舰" },
  { model: "deepseek-v4-flash", ctx: "1M", input: "¥1", output: "¥2", category: "高速" },
  { model: "deepseek-r1", ctx: "64K", input: "¥4", output: "¥16", category: "推理" },
  { model: "deepseek-v3", ctx: "64K", input: "¥2", output: "¥8", category: "通用" },
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
          nexusflow 整合了业界领先的大语言模型，提供统一的 API 接口。选择最适合您需求的模型。
        </p>
      </div>

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
                        background: cat.tag === "推荐" ? "var(--success-bg)" : cat.tag === "最新" ? "#dbeafe" : "var(--warning-bg)",
                        color: cat.tag === "推荐" ? "var(--success)" : cat.tag === "最新" ? "#1d4ed8" : "var(--warning)",
                        border: cat.tag === "推荐" ? "1px solid var(--success-border)" : cat.tag === "最新" ? "1px solid rgba(29,78,216,.16)" : "1px solid var(--warning-border)",
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
