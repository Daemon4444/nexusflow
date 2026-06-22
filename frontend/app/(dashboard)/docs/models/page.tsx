"use client";

import Link from "next/link";

const modelCategories = [
  {
    name: "Qwen Series",
    provider: "Alibaba Cloud",
    desc: "Alibaba Cloud's in-house models. Currently featuring the Qwen3.6 and Qwen3.5 series, with strong language understanding and ultra-long context support",
    href: "/docs/models/qwen",
    introHref: "/docs/models/qwen/intro",
    models: ["Qwen3.7 Max", "Qwen3.6 Max Preview", "Qwen3.6 Plus", "Qwen3.5 Omni Plus", "Qwen3.5 Omni Flash", "Qwen3.5 Plus", "Qwen3.5 Flash"],
    color: "#7c3aed",
    tag: null,
  },
  {
    name: "Claude Series",
    provider: "Anthropic",
    desc: "Anthropic flagship models with 1M-token context and excellent reasoning and coding. Called via the /v1/messages compatible endpoint",
    href: "/docs/api/anthropic",
    introHref: "/docs/models/claude",
    models: ["Claude Opus 4.7", "Claude Sonnet 4.6", "Claude Haiku 4.5"],
    color: "#b45309",
    tag: "Differentiated",
  },
  {
    name: "DeepSeek Series",
    provider: "DeepSeek",
    desc: "High-performance reasoning and general-purpose models with strong coding ability, ideal for complex tasks and high-concurrency scenarios",
    href: "/docs/models/deepseek",
    introHref: "/docs/models/deepseek/intro",
    models: ["DeepSeek V4 Pro", "DeepSeek V4 Flash", "DeepSeek R1", "DeepSeek V3.2"],
    color: "#0ea5e9",
    tag: "Cost-effective",
  },
  {
    name: "Zhipu GLM Series",
    provider: "Zhipu AI",
    desc: "A leading large language model with comprehensive general capabilities and long-context support",
    href: "/docs/api/glm",
    introHref: "/docs/api/glm",
    models: ["GLM 5.2", "GLM 5.1", "GLM 5", "GLM 4.7"],
    color: "#059669",
    tag: null,
  },
  {
    name: "Kimi Series",
    provider: "Moonshot AI",
    desc: "Moonshot AI's models, with powerful long-text understanding and reasoning",
    href: "/docs/api/kimi",
    introHref: "/docs/api/kimi",
    models: ["Kimi K2.6", "Kimi K2.5"],
    color: "#6366f1",
    tag: null,
  },
  {
    name: "MiniMax Series",
    provider: "MiniMax",
    desc: "MiniMax models, ideal for general conversation and content creation",
    href: "/docs/api/minimax",
    introHref: "/docs/api/minimax",
    models: ["MiniMax M2.5", "MiniMax M2.1"],
    color: "#ec4899",
    tag: null,
  },
  {
    name: "HappyHorse Feature",
    provider: "Alibaba",
    desc: "The top-ranked video generation model on VBench, supporting text-to-video and image-to-video, integrated through nexusflow",
    href: "/docs/models/happyhorse",
    introHref: "/docs/models/happyhorse",
    models: ["happyhorse-1.0-t2v", "happyhorse-1.0-i2v", "happyhorse-1.0-r2v"],
    color: "#2563eb",
    tag: "New",
  },
  {
    name: "PixVerse Video Models",
    provider: "PixVerse",
    desc: "Professional video generation models supporting text-to-video, image-to-video, first-and-last-frame, and reference-to-video",
    href: "/docs/models/pixverse",
    introHref: "/docs/models/pixverse/intro",
    models: ["PixVerse V6"],
    color: "#06b6d4",
    tag: null,
  },
];

const pricingTable = [
  { model: "qwen3.7-max", ctx: "1M", input: "$12", output: "$36", category: "Flagship" },
  { model: "qwen3.6-max-preview", ctx: "256K", input: "$9", output: "$54", category: "Flagship" },
  { model: "qwen3.6-plus", ctx: "1M", input: "$2", output: "$12", category: "Balanced" },
  { model: "qwen3.5-plus", ctx: "1M", input: "$0.8", output: "$4.8", category: "Balanced" },
  { model: "qwen3.5-flash", ctx: "1M", input: "$0.2", output: "$2", category: "Ultra-fast" },
  { model: "claude-opus-4-7", ctx: "1M", input: "≈$34", output: "≈$170", category: "Flagship" },
  { model: "claude-sonnet-4-6", ctx: "1M", input: "≈$20.4", output: "≈$102", category: "Balanced" },
  { model: "claude-haiku-4-5", ctx: "200K", input: "≈$6.8", output: "≈$34", category: "High-speed" },
  { model: "deepseek-v4-pro", ctx: "1M", input: "$12", output: "$24", category: "Reasoning Flagship" },
  { model: "deepseek-v4-flash", ctx: "1M", input: "$1", output: "$2", category: "High-speed" },
  { model: "deepseek-r1", ctx: "128K", input: "$4", output: "$16", category: "Reasoning" },
  { model: "deepseek-v3.2", ctx: "128K", input: "$2", output: "$3", category: "General" },
  { model: "glm-5.2", ctx: "1M", input: "$8", output: "$28", category: "Long-horizon Flagship" },
  { model: "glm-5.1", ctx: "198K", input: "$6", output: "$24", category: "Flagship" },
  { model: "glm-5", ctx: "198K", input: "$4", output: "$18", category: "Balanced" },
  { model: "kimi-k2.6", ctx: "256K", input: "$6.5", output: "$27", category: "Reasoning" },
  { model: "kimi-k2.5", ctx: "256K", input: "$4", output: "$21", category: "Balanced" },
  { model: "MiniMax-M2.5", ctx: "192K", input: "$2.1", output: "$8.4", category: "Balanced" },
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
          Models Overview
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          nexusflow brings together industry-leading large language models and offers public endpoints such as OpenAI, Anthropic Messages, Responses API, Embeddings, Image Generations, and Tasks based on each model's capabilities. Choose the model that best fits your needs.
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Protocols Overview
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/multi-protocol", title: "Text Models", desc: "OpenAI Chat, Anthropic Messages, Responses API" },
            { href: "/docs/api/embeddings", title: "Embedding Models", desc: "OpenAI Embeddings" },
            { href: "/docs/api/async", title: "Image / Video", desc: "Image Generations or NexusFlow Tasks" },
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
          Model Families
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
                        background: cat.tag === "Recommended" ? "var(--success-bg)" : cat.tag === "New" ? "#dbeafe" : "var(--warning-bg)",
                        color: cat.tag === "Recommended" ? "var(--success)" : cat.tag === "New" ? "#1d4ed8" : "var(--warning)",
                        border: cat.tag === "Recommended" ? "1px solid var(--success-border)" : cat.tag === "New" ? "1px solid rgba(29,78,216,.16)" : "1px solid var(--warning-border)",
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
                  Overview
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
                  API Docs
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing comparison */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Price Comparison
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 16 }}>
          Prices are in USD per 1M tokens
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Context</th>
                <th style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Input Price</th>
                <th style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Output Price</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Positioning</th>
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
          Selection Guide
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            {
              scenario: "Complex reasoning & coding",
              recommend: "Qwen3 Max",
              reason: "Well-balanced flagship capabilities, ideal for complex reasoning, code generation, and system tasks",
            },
            {
              scenario: "Everyday chat & creation",
              recommend: "Qwen3.5 Plus",
              reason: "Balances performance and cost, ideal for most online chat and business scenarios",
            },
            {
              scenario: "Long-document processing",
              recommend: "Qwen3.5 Series",
              reason: "Excellent language understanding and generation, with ultra-long text support",
            },
            {
              scenario: "Cost-effective needs",
              recommend: "DeepSeek V3",
              reason: "Open-source model, affordable pricing, and outstanding coding ability",
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
          Not sure which model to choose?
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          Try each model for free in the Playground and find the best fit for you.
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
          Open Playground
        </Link>
      </section>
    </div>
  );
}
