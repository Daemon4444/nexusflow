"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const openaiExample = `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "enable_context_caching": true,
    "messages": [
      {
        "role": "system",
        "content": [
          {
            "type": "text",
            "text": "You are a financial analyst. Below is the full text of the company annual report (about 50,000 words)...",
            "cache_control": {"type": "ephemeral"}
          }
        ]
      },
      {"role": "user", "content": "Summarize the key risks in this annual report"}
    ]
  }'`;

const anthropicExample = `curl https://nexusflow.hk/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "system": [
      {
        "type": "text",
        "text": "You are a code review expert. Below is the full repository context...",
        "cache_control": {"type": "ephemeral"}
      }
    ],
    "messages": [
      {"role": "user", "content": "Find security vulnerabilities in this code"}
    ]
  }'`;

const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-xxx",
    base_url="https://nexusflow.hk/v1"
)

# A long system prompt is cached on the first request and hits automatically afterwards
response = client.chat.completions.create(
    model="qwen3.5-plus",
    extra_body={"enable_context_caching": True},
    messages=[
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": long_document,  # your long document
                    "cache_control": {"type": "ephemeral"}
                }
            ]
        },
        {"role": "user", "content": "Please summarize the key points"}
    ]
)

# Inspect cache usage
details = response.usage.prompt_tokens_details
print(f"Cache hit: {details.cached_tokens} tokens")
print(f"Cache creation: {details.cache_creation_input_tokens} tokens")`;

const supportedModels = [
  { provider: "Qwen", models: "Qwen3.7 Max, Qwen3.6 Max Preview, Qwen3.6 Plus/Flash, Qwen3.5 Plus/Flash, Qwen3 Max, Qwen Plus/Turbo, Qwen VL series, Qwen3 Coder series", min: "1024 (explicit) / 256 (implicit)" },
  { provider: "DeepSeek", models: "DeepSeek V3.2", min: "1024 (explicit)" },
  { provider: "Zhipu GLM", models: "GLM 5.1, GLM 5, GLM 4.7", min: "512" },
  { provider: "Kimi", models: "Kimi K2.5, K2.6", min: "1024 (explicit)" },
  { provider: "Anthropic", models: "Claude Opus 4.7, Sonnet 4.6, Haiku 4.5", min: "1024" },
];

export default function ContextCachePage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px", letterSpacing: "-0.5px" }}>
          Context Cache
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760 }}>
          For repeated system prompts, long document context, or fixed prefixes in multi-turn chat, enabling context caching can save up to 90% on input cost.
        </p>
      </div>

      {/* How it works */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>How It Works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { step: "1", title: "Mark for cache", desc: "Add a cache_control annotation to a content block" },
            { step: "2", title: "First request", desc: "The marked portion is cached and billed at 1.25× input" },
            { step: "3", title: "Subsequent requests", desc: "Cache hits are billed at 0.1× input (90% off)" },
          ].map((item) => (
            <div key={item.step} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>{item.step}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Billing Rules</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 2fr", padding: "12px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>Token type</span><span>Multiplier</span><span>Response field</span><span>Notes</span>
          </div>
          {[
            ["Cache creation", "1.25x", "cache_creation_input_tokens", "First request writes the cache—slightly higher than normal input"],
            ["Cache hit", "0.1x", "cached_tokens", "Subsequent hits—saves 90%"],
            ["Normal input", "1x", "prompt_tokens − cached portion", "Input that wasn't marked for caching"],
            ["Output", "1x", "completion_tokens", "Output is billed normally—not affected by caching"],
          ].map(([type, rate, field, desc], i) => (
            <div key={type} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 2fr", padding: "12px 14px", borderBottom: i < 3 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <span style={{ fontWeight: 500 }}>{type}</span>
              <span style={{ color: rate === "0.1x" ? "var(--success)" : rate === "1.25x" ? "#b45309" : "var(--text-secondary)", fontWeight: 600 }}>{rate}</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>{field}</code>
              <span style={{ color: "var(--text-tertiary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Cache conditions */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Cache Conditions</h2>
        <div style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Minimum token count</strong>: explicit caching requires the marked content to be ≥ 1024 tokens (256/512 for some models)</li>
            <li><strong>Cache TTL</strong>: ephemeral caches live for about 5 minutes; identical-prefix requests during that window hit automatically</li>
            <li><strong>Maximum markers</strong>: up to 4 <code>cache_control</code> markers per request</li>
            <li><strong>Implicit vs. explicit</strong>: implicit caching (no marker) is decided by the system automatically and needs no configuration; explicit caching uses markers to precisely control cache boundaries</li>
            <li><strong>Mutually exclusive</strong>: explicit and implicit caching are mutually exclusive within a single request—if any markers are present, the explicit form wins</li>
          </ul>
        </div>
      </section>

      {/* Usage: OpenAI protocol */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Usage: OpenAI Protocol</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          In <code>/v1/chat/completions</code>, use the array form of <code>content</code> and add <code>cache_control</code> to each text block you want cached:
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 14 }}>
          <DocsCodeBlock code={openaiExample} />
        </div>
      </section>

      {/* Usage: Anthropic protocol */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Usage: Anthropic Protocol</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          In <code>/v1/messages</code>, add the same markers on content blocks inside <code>system</code> or <code>messages</code>:
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 14 }}>
          <DocsCodeBlock code={anthropicExample} />
        </div>
      </section>

      {/* Python SDK example */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Python SDK Example</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={pythonExample} />
        </div>
      </section>

      {/* Supported models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Supported Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 200px", padding: "12px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>Provider</span><span>Models</span><span>Minimum cache length</span>
          </div>
          {supportedModels.map((row, i) => (
            <div key={row.provider} style={{ display: "grid", gridTemplateColumns: "150px 1fr 200px", padding: "12px 14px", borderBottom: i < supportedModels.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <span style={{ fontWeight: 500 }}>{row.provider}</span>
              <span style={{ color: "var(--text-secondary)" }}>{row.models}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{row.min}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Response format */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Response Format</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          Cache hit info is returned in the <code>usage</code> field; the format differs slightly between protocols:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>OpenAI Response</div>
            <pre style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>{`usage.prompt_tokens_details:
  cached_tokens: 1804
  cache_creation_input_tokens: 0`}</pre>
          </div>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Anthropic Response</div>
            <pre style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>{`usage:
  cache_read_input_tokens: 1804
  cache_creation_input_tokens: 0`}</pre>
          </div>
        </div>
      </section>

      {/* Best practices */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Best Practices</h2>
        <div style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Put <strong>stable, long content</strong> (system prompt, reference docs, code context) at the front of <code>messages</code> and mark it for caching</li>
            <li><strong>Put user messages last</strong> — the cache spans from the start of the array to the marker, so changing content placed after it does not break cache hits</li>
            <li>Good fits: RAG document injection, fixed system prompts in multi-turn chat, agent tool definitions, codebase context</li>
            <li>Poor fits: requests where content changes completely each time, or prompts shorter than the minimum threshold</li>
          </ul>
        </div>
      </section>

      {/* Related */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "Full OpenAI format reference" },
          { href: "/docs/api/anthropic", label: "Anthropic Messages", desc: "Calling the Anthropic protocol" },
          { href: "/pricing", label: "Model Pricing", desc: "See the full tiered price list" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
