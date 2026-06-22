"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const deepseekModels = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    desc: "DeepSeek V4 flagship reasoning model, ideal for complex math, long-horizon decision-making, and code agent tasks.",
    ctx: "1,000,000",
    maxOutput: "16,384",
    inputPrice: "$12",
    outputPrice: "$24",
    tags: ["V4", "Flagship", "Reasoning"],
    features: ["Complex reasoning", "Code agent", "Function calling"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    desc: "DeepSeek V4 high-speed version, low latency and high throughput, ideal for online Q&A, customer support, and high-concurrency gateway scenarios.",
    ctx: "1,000,000",
    maxOutput: "16,384",
    inputPrice: "$1",
    outputPrice: "$2",
    tags: ["V4", "Ultra-fast", "High-concurrency"],
    features: ["Low latency", "High throughput", "Online chat"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    desc: "Reasoning-enhanced model that analyzes complex problems via chain-of-thought. Excels at math, programming, and logical reasoning.",
    ctx: "64,000",
    maxOutput: "8,000",
    inputPrice: "$4",
    outputPrice: "$16",
    tags: ["Reasoning", "Chain-of-thought"],
    features: ["Chain-of-thought", "Code generation", "Math reasoning"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    desc: "Latest-generation general-purpose model with an MoE architecture, with all-round improvements in code, math, and general ability. Extremely cost-effective.",
    ctx: "64,000",
    maxOutput: "8,000",
    inputPrice: "$2",
    outputPrice: "$8",
    tags: ["Recommended", "Cost-effective"],
    features: ["Code generation", "Function calling", "Multilingual"],
    isNew: true,
    isFeatured: true,
  },
];

export default function DeepSeekModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              DeepSeek Series
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              by DeepSeek AI
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          DeepSeek is a leading open-source large model known for its exceptional cost-effectiveness.
          It stands out in code generation and math reasoning, making it an ideal choice for budget-sensitive scenarios. Text models can be accessed via three public protocols: OpenAI Chat, Anthropic Messages, and Responses API.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Protocols
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "OpenAI Chat", endpoint: "/v1/chat/completions" },
            { href: "/docs/api/anthropic", label: "Anthropic Messages", endpoint: "/v1/messages" },
            { href: "/docs/api/responses", label: "Responses API", endpoint: "/v1/responses" },
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
          Core Advantages
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "💰", label: "Highly cost-effective", desc: "About 1/10 the price of peers" },
            { icon: "🔓", label: "Open & transparent", desc: "Weights are public and auditable" },
            { icon: "💻", label: "Coding powerhouse", desc: "Outstanding programming ability" },
            { icon: "🧮", label: "Math reasoning", desc: "Strong complex computation" },
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
          {deepseekModels.map((model) => (
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
                    <span key={tag} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: tag === "Recommended" || tag === "Cost-effective" ? "var(--success-bg)" : tag === "Reasoning" ? "var(--warning-bg)" : "var(--bg-elevated)", color: tag === "Recommended" || tag === "Cost-effective" ? "var(--success)" : tag === "Reasoning" ? "var(--warning)" : "var(--text-secondary)", fontWeight: 500 }}>
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
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Context Window</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.ctx}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Max Output</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.maxOutput}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Input Price</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{model.inputPrice}/M</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Output Price</div>
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

# Use DeepSeek R1 for reasoning
response = client.chat.completions.create(
    model="deepseek-r1",
    messages=[
        {"role": "user", "content": "Reason step by step: if A > B and B > C, what is the relationship between A and C?"}
    ],
    max_tokens=2048,
)

# The R1 model shows its chain-of-thought process
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
            { href: "/docs/models/qwen", label: "Qwen", desc: "Compare with the general-purpose flagship" },
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
