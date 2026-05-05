"use client";

import Link from "next/link";

const quickLinks = [
  {
    title: "快速开始",
    desc: "从第一个对话请求到异步任务接入",
    href: "/docs/quickstart",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    color: "#f59e0b",
    bg: "#fffbeb",
  },
  {
    title: "模型总览",
    desc: "浏览模型服务、专题页和定价入口",
    href: "/docs/models",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    color: "#8b5cf6",
    bg: "#f5f3ff",
  },
  {
    title: "API 参考",
    desc: "OpenAI、Anthropic、Gemini 兼容协议",
    href: "/docs/api",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    color: "#3b82f6",
    bg: "#eff6ff",
  },
  {
    title: "监控与限流",
    desc: "面向生产流量的限额、队列和观测说明",
    href: "/docs/api/limits",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    color: "#10b981",
    bg: "#ecfdf5",
  },
];

const popularModels = [
  { name: "HappyHorse 1.0", provider: "Alibaba", desc: "视频生成专题页与任务链路接入说明", tag: "最新" },
  { name: "Qwen3 Max", provider: "阿里云", desc: "旗舰推理与复杂任务处理", tag: "推荐" },
  { name: "Qwen3.5 Plus", provider: "阿里云", desc: "性价比之选，均衡高效", tag: "热门" },
  { name: "Qwen3.5 Max", provider: "阿里云", desc: "千亿参数，长文本专家", tag: null },
  { name: "DeepSeek R1", provider: "DeepSeek", desc: "开源推理，代码专长", tag: null },
];

const apiEndpoints = [
  { method: "POST", path: "/v1/chat/completions", desc: "对话补全" },
  { method: "POST", path: "/v1/messages", desc: "Anthropic Messages 兼容" },
  { method: "POST", path: "/v1beta/models/{model}:generateContent", desc: "Gemini GenerateContent 兼容" },
  { method: "POST", path: "/v1/embeddings", desc: "文本向量" },
  { method: "POST", path: "/v1/tasks", desc: "图像 / 视频异步任务提交" },
  { method: "GET", path: "/v1/tasks/:id", desc: "异步任务轮询" },
];

const protocols = [
  { name: "OpenAI-compatible", endpoint: "/v1/chat/completions", href: "/docs/api/chat", desc: "推荐默认接入方式，覆盖对话、推理、工具调用和多数语言 SDK。" },
  { name: "Anthropic Messages", endpoint: "/v1/messages", href: "/docs/api/anthropic", desc: "适合复用 Anthropic SDK、Claude Code 风格客户端和 Messages 请求格式。" },
  { name: "Gemini-compatible", endpoint: "/v1beta/models/{model}:generateContent", href: "/docs/api/gemini", desc: "适合已有 Gemini SDK 或 GenerateContent HTTP 调用迁移。" },
];

export default function DocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          fontSize: 36,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 12,
          letterSpacing: "-0.5px",
          fontFamily: "var(--font-serif)",
        }}>
          nexusflow 开发者文档
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 600 }}>
          一站式接入通义千问、DeepSeek、GLM、Kimi、HappyHorse 等模型。支持 OpenAI、Anthropic Messages、Gemini-compatible 三类协议，统一计费、密钥和监控。
        </p>
      </div>

      <section style={{ marginBottom: 56 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}>
          {[
            { title: "模型服务", desc: "统一模型列表、价格和能力入口" },
            { title: "三协议接入", desc: "OpenAI / Anthropic / Gemini 兼容入口" },
            { title: "监控评测", desc: "监控页、错误码、性能指标说明" },
            { title: "高并发准备", desc: "限流、队列、任务链路与容量提升入口" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 18 }}>
          三种兼容协议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {protocols.map((protocol) => (
            <Link
              key={protocol.name}
              href={protocol.href}
              style={{
                padding: 18,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{protocol.name}</div>
              <code style={{ display: "block", fontSize: 12, color: "var(--accent)", fontFamily: "var(--font-mono)", marginBottom: 10 }}>{protocol.endpoint}</code>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>{protocol.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16,
        marginBottom: 56,
      }}>
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: "flex",
              gap: 16,
              padding: 24,
              background: link.bg,
              borderRadius: 12,
              border: "1px solid transparent",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: link.color,
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              {link.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 4 }}>
                {link.title}
              </div>
              <div style={{ fontSize: 13, color: "#666" }}>
                {link.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Popular models */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          热门模型
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          {popularModels.map((model, idx) => (
            <div
              key={model.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: idx < popularModels.length - 1 ? "1px solid var(--border)" : "none",
                background: "var(--bg)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                    {model.name}
                  </span>
                  {model.tag && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: model.tag === "推荐" ? "var(--success-bg)" : model.tag === "最新" ? "#dbeafe" : "var(--warning-bg)",
                      color: model.tag === "推荐" ? "var(--success)" : model.tag === "最新" ? "#1d4ed8" : "var(--warning)",
                      border: model.tag === "推荐" ? "1px solid var(--success-border)" : model.tag === "最新" ? "1px solid rgba(29,78,216,.16)" : "1px solid var(--warning-border)",
                    }}>
                      {model.tag}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {model.provider} · {model.desc}
                </div>
              </div>
              <Link
                href={`/docs/models/${model.name === "HappyHorse 1.0" ? "happyhorse" : model.provider === "阿里云" ? "qwen" : model.provider === "DeepSeek" ? "deepseek" : "other"}`}
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                查看详情
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* API endpoints preview */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          API 端点
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          {apiEndpoints.map((ep, idx) => (
            <Link
              key={ep.path}
              href={ep.path.startsWith("/v1/tasks") ? "/docs/api/tasks" : ep.path === "/v1/embeddings" ? "/docs/api/embeddings" : "/docs/api/chat"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 20px",
                borderBottom: idx < apiEndpoints.length - 1 ? "1px solid var(--border)" : "none",
                background: "var(--bg)",
                textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseOut={(e) => e.currentTarget.style.background = "var(--bg)"}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 4,
                background: "#dbeafe",
                color: "#1d4ed8",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {ep.method}
              </span>
              <code style={{
                fontSize: 13,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
                flex: 1,
              }}>
                {ep.path}
              </code>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                {ep.desc}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 56 }}>
        <h2 style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 20,
        }}>
          生产流量建议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "对话走同步接口", desc: "聊天和推理模型优先使用 `/v1/chat/completions`，减少不必要的轮询复杂度。" },
            { title: "多媒体走异步任务", desc: "图像和视频统一走 `/v1/tasks`，用任务状态承接高时延和高峰值处理。" },
            { title: "上线前看限流与监控", desc: "在限流页、错误码和监控页确认峰值请求策略，避免流量突刺时才发现瓶颈。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick code example */}
      <section>
        <h2 style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
          快速示例
        </h2>
        <div style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: 24,
          overflow: "auto",
        }}>
          <pre style={{
            margin: 0,
            fontSize: 13,
            color: "#e5e5e5",
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.6,
          }}>
{`from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {"role": "user", "content": "Hello!"}
    ],
)

print(response.choices[0].message.content)`}
          </pre>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          使用标准 OpenAI SDK，只需修改 base_url 即可接入 nexusflow。
          <Link href="/docs/quickstart" style={{ color: "var(--accent)", marginLeft: 8 }}>
            查看完整教程 →
          </Link>
        </p>
      </section>
    </div>
  );
}
