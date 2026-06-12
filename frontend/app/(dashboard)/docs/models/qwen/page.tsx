"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const qwenModels = [
  {
    id: "qwen3.7-max",
    name: "Qwen3.7 Max",
    desc: "Qwen 3.7-generation flagship model built for the agent era. Major upgrades to coding, productivity, and long-horizon autonomous execution. Supports thinking-mode toggling, function calling, and web search. Million-token context.",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "$12",
    outputPrice: "$36",
    tags: ["Flagship", "New", "Thinking Mode", "Agent"],
    features: ["Function Calling", "Thinking Mode", "Web Search", "Million-Token Context"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    desc: "The strongest preview model in the Qwen3.6 series—great for complex reasoning, multi-step code generation, and tool-using tasks.",
    ctx: "262,144",
    maxOutput: "65,536",
    inputPrice: "$9",
    outputPrice: "$54",
    tags: ["Flagship", "Thinking Mode"],
    features: ["Function Calling", "Complex Reasoning", "Code Generation"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    desc: "Balanced flagship model with a million-token context window, function calling, and built-in tools—well suited to most production scenarios.",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "$2",
    outputPrice: "$12",
    tags: ["Recommended", "Balanced"],
    features: ["Image Understanding", "Function Calling", "Code Generation", "Million-Token Context"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    desc: "Balanced-performance model that fits most production workloads—strong Chinese ability and fast responses.",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "$0.8",
    outputPrice: "$4.8",
    tags: ["Recommended", "Balanced"],
    features: ["Image Understanding", "Function Calling", "Code Generation"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    desc: "High-speed model for latency-sensitive use cases—excellent value.",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "$0.2",
    outputPrice: "$2",
    tags: ["Fast", "Economical"],
    features: ["Function Calling", "Low Cost"],
    isNew: false,
    isFeatured: false,
  },
];

export default function QwenModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Qwen Series
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              by Alibaba Cloud
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          Qwen is Alibaba Cloud&apos;s in-house LLM family. We currently highlight the Qwen3.6 and Qwen3.5 series here, which cover common production scenarios like long-context, function calling, code generation, and complex reasoning. Text models can be accessed via three shared protocols: OpenAI Chat, Anthropic Messages, and Gemini-compatible.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Integration Protocols
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "OpenAI Chat", endpoint: "/v1/chat/completions" },
            { href: "/docs/api/anthropic", label: "Anthropic Messages", endpoint: "/v1/messages" },
            { href: "/docs/api/gemini", label: "Gemini-compatible", endpoint: "/v1beta/models/{model}:generateContent" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{item.label}</div>
              <code style={{ fontSize: 11, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{item.endpoint}</code>
            </Link>
          ))}
        </div>
      </section>

      {/* Key features */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Key Strengths
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "🇨🇳", label: "Chinese-Optimized", desc: "Native-level understanding" },
            { icon: "📚", label: "Long Context", desc: "Million-token window" },
            { icon: "⚡", label: "Great Value", desc: "Affordable pricing" },
            { icon: "🔗", label: "Ecosystem", desc: "Seamless on Alibaba Cloud" },
          ].map((f) => (
            <div key={f.label} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 10,
              border: "1px solid var(--border)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Models list */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Available Models
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {qwenModels.map((model) => (
            <div
              key={model.id}
              style={{
                padding: 24,
                background: "var(--bg)",
                borderRadius: 12,
                border: model.isFeatured ? "2px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {model.name}
                    </h3>
                    {model.isNew && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "2px 8px", borderRadius: 4 }}>
                    {model.id}
                  </code>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {model.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: tag === "Recommended" ? "var(--accent-bg)" : "var(--bg-elevated)", color: tag === "Recommended" ? "var(--accent)" : "var(--text-secondary)", fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
                {model.desc}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Context window</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.ctx}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Max output</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.maxOutput}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Input price</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{model.inputPrice}/M</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Output price</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{model.outputPrice}/M</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {model.features.map((f) => (
                  <span key={f} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Usage example */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Usage Example
        </h2>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={`from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

# Use Qwen for long-document analysis
response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[
        {"role": "system", "content": "You are an expert document analyst."},
        {"role": "user", "content": "Summarize the main points of the following long document... (paste your long text here)"}
    ],
    max_tokens=4096,
)

print(response.choices[0].message.content)`} />
        </div>
      </section>

      {/* Related */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Related Docs
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "Chat Completions API", desc: "How to call the API" },
            { href: "/docs/models/deepseek", label: "DeepSeek Series", desc: "Compare reasoning models" },
            { href: "/playground", label: "Playground", desc: "Try it online" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
