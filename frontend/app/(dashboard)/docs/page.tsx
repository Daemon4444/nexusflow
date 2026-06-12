"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const quickLinks = [
  {
    title: "Quick Start",
    desc: "From your first chat request to async task integration",
    href: "/docs/quickstart",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    color: "#f59e0b",
    bg: "#fffbeb",
  },
  {
    title: "Models Overview",
    desc: "Browse model offerings, dedicated pages, and pricing",
    href: "/docs/models",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    color: "#8b5cf6",
    bg: "#f5f3ff",
  },
  {
    title: "API Reference",
    desc: "OpenAI, Anthropic, and Gemini compatible protocols",
    href: "/docs/api",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    color: "#3b82f6",
    bg: "#eff6ff",
  },
  {
    title: "Monitoring & Rate Limits",
    desc: "Production-grade quotas, queues, and observability",
    href: "/docs/api/limits",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    color: "#10b981",
    bg: "#ecfdf5",
  },
];

const popularModels = [
  { name: "HappyHorse 1.0", provider: "Alibaba", desc: "Video generation page and task pipeline guide", tag: "New" },
  { name: "Qwen3 Max", provider: "Alibaba Cloud", desc: "Flagship reasoning and complex task processing", tag: "Recommended" },
  { name: "Qwen3.5 Plus", provider: "Alibaba Cloud", desc: "Best value, balanced and efficient", tag: "Popular" },
  { name: "Qwen3.5 Max", provider: "Alibaba Cloud", desc: "Hundreds of billions of parameters, long-context expert", tag: null },
  { name: "DeepSeek R1", provider: "DeepSeek", desc: "Open-source reasoning, strong at coding", tag: null },
];

const apiEndpoints = [
  { method: "POST", path: "/v1/chat/completions", desc: "Chat completions" },
  { method: "POST", path: "/v1/messages", desc: "Anthropic Messages compatible" },
  { method: "POST", path: "/v1beta/models/{model}:generateContent", desc: "Gemini GenerateContent compatible" },
  { method: "POST", path: "/v1/embeddings", desc: "Text embeddings" },
  { method: "POST", path: "/v1/tasks", desc: "Submit image / video async tasks" },
  { method: "GET", path: "/v1/tasks/:id", desc: "Async task polling" },
];

const protocols = [
  { name: "OpenAI-compatible", endpoint: "/v1/chat/completions", href: "/docs/api/chat", desc: "Recommended default integration—covers chat, reasoning, tool calls, and most language SDKs." },
  { name: "Anthropic Messages", endpoint: "/v1/messages", href: "/docs/api/anthropic", desc: "Ideal for reusing the Anthropic SDK, Claude Code-style clients, and Messages request format." },
  { name: "Gemini-compatible", endpoint: "/v1beta/models/{model}:generateContent", href: "/docs/api/gemini", desc: "Ideal for migrating existing Gemini SDK or GenerateContent HTTP calls." },
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
          nexusflow Developer Documentation
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 600 }}>
          A unified gateway to Qwen, DeepSeek, GLM, Kimi, HappyHorse, and more. Supports OpenAI, Anthropic Messages, and Gemini-compatible protocols with shared billing, key management, and monitoring.
        </p>
      </div>

      <section style={{ marginBottom: 56 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}>
          {[
            { title: "Model Services", desc: "Unified model catalog, pricing, and capabilities" },
            { title: "Three-Protocol Access", desc: "OpenAI / Anthropic / Gemini compatible endpoints" },
            { title: "Monitoring & Evaluation", desc: "Monitoring page, error codes, and performance metrics" },
            { title: "High-Concurrency Ready", desc: "Rate limits, queues, task pipelines, and capacity uplift" },
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
          Three Compatible Protocols
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
          Popular Models
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
                      background: model.tag === "Recommended" ? "var(--success-bg)" : model.tag === "New" ? "#dbeafe" : "var(--warning-bg)",
                      color: model.tag === "Recommended" ? "var(--success)" : model.tag === "New" ? "#1d4ed8" : "var(--warning)",
                      border: model.tag === "Recommended" ? "1px solid var(--success-border)" : model.tag === "New" ? "1px solid rgba(29,78,216,.16)" : "1px solid var(--warning-border)",
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
                href={`/docs/models/${model.name === "HappyHorse 1.0" ? "happyhorse" : model.provider === "Alibaba Cloud" ? "qwen" : model.provider === "DeepSeek" ? "deepseek" : "other"}`}
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                View details
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
          API Endpoints
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
          Production Traffic Tips
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "Use the sync endpoint for chat", desc: "Prefer `/v1/chat/completions` for chat and reasoning models to avoid unnecessary polling complexity." },
            { title: "Use async tasks for media", desc: "Run image and video workloads through `/v1/tasks`, using task state to absorb high latency and traffic spikes." },
            { title: "Check rate limits and monitoring", desc: "Verify peak-traffic strategies on the rate-limits, error-codes, and monitoring pages before launch to avoid surprises." },
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
          Quick Example
        </h2>
        <div style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: 24,
          overflow: "auto",
        }}>
          <DocsCodeBlock code={`from openai import OpenAI

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

print(response.choices[0].message.content)`} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          Use the standard OpenAI SDK—just change the base_url to integrate with nexusflow.
          <Link href="/docs/quickstart" style={{ color: "var(--accent)", marginLeft: 8 }}>
            See the full tutorial →
          </Link>
        </p>
      </section>
    </div>
  );
}
