"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type ModelTabKey = "llm" | "reasoning" | "vision" | "coding";
type CodeTabKey = "basic" | "reasoning" | "vision" | "coding";

const modelTabs: { key: ModelTabKey; label: string }[] = [
  { key: "llm", label: "Language" },
  { key: "reasoning", label: "Reasoning" },
  { key: "vision", label: "Vision" },
  { key: "coding", label: "Coding" },
];

const codeTabs: { key: CodeTabKey; label: string }[] = [
  { key: "basic", label: "Basic Chat" },
  { key: "reasoning", label: "Reasoning Mode" },
  { key: "vision", label: "Vision" },
  { key: "coding", label: "Coding" },
];

const qwenProtocols = [
  {
    protocol: "OpenAI Chat Completions",
    endpoint: "/v1/chat/completions",
    status: "Available",
    usage: "Default example endpoint, supports the OpenAI SDK, streaming, tool calling, vision input and reasoning fields.",
  },
  {
    protocol: "Anthropic Messages",
    endpoint: "/v1/messages",
    status: "Available",
    usage: "Suitable for reusing the Anthropic SDK or Messages format; model still uses the NexusFlow Qwen model ID.",
  },
  {
    protocol: "Gemini-compatible GenerateContent",
    endpoint: "/v1beta/models/{model}:generateContent",
    status: "Available",
    usage: "Suitable for migrating existing Google GenAI / Gemini HTTP calls; the model in the path is a NexusFlow model ID.",
  },
];

const modelsByTab: Record<ModelTabKey, { id: string; ctx: string; input: string; output: string }[]> = {
  llm: [
    { id: "qwen3.7-max", ctx: "1M", input: "$12/M", output: "$36/M" },
    { id: "qwen3-max", ctx: "262K", input: "$2.5/M", output: "$10/M" },
    { id: "qwen3.6-max-preview", ctx: "262K", input: "$9/M", output: "$54/M" },
    { id: "qwen3.6-plus", ctx: "1M", input: "$2/M", output: "$12/M" },
    { id: "qwen3.6-flash", ctx: "1M", input: "$1.2/M", output: "$7.2/M" },
    { id: "qwen3.5-plus", ctx: "1M", input: "$0.8/M", output: "$4.8/M" },
    { id: "qwen3.5-flash", ctx: "1M", input: "$0.2/M", output: "$2/M" },
    { id: "qwen-plus", ctx: "1M", input: "$0.8/M", output: "$2/M" },
    { id: "qwen-turbo", ctx: "1M", input: "$0.3/M", output: "$0.6/M" },
  ],
  reasoning: [
    { id: "qwq-plus", ctx: "131K", input: "$1.6/M", output: "$4/M" },
    { id: "qwen-math-plus", ctx: "4K", input: "$4/M", output: "$12/M" },
  ],
  vision: [
    { id: "qwen-vl-max", ctx: "131K", input: "$1.6/M", output: "$4/M" },
    { id: "qwen-vl-plus", ctx: "131K", input: "$0.8/M", output: "$2/M" },
    { id: "qwen3-vl-plus", ctx: "262K", input: "$1/M", output: "$10/M" },
    { id: "qwen3-vl-flash", ctx: "262K", input: "$0.15/M", output: "$1.5/M" },
  ],
  coding: [
    { id: "qwen3-coder-plus", ctx: "1M", input: "$4/M", output: "$16/M" },
    { id: "qwen3-coder-flash", ctx: "1M", input: "$1/M", output: "$4/M" },
  ],
};

const curlExamples: Record<CodeTabKey, string> = {
  basic: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3-max",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Briefly introduce the basic principles of quantum computing"}
    ],
    "temperature": 0.7,
    "max_tokens": 2000
  }'`,
  reasoning: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwq-plus",
    "messages": [
      {"role": "user", "content": "A pool has two inlet pipes and one outlet pipe. Inlet A pumps 3 tons of water per hour, inlet B pumps 2 tons per hour, and the outlet drains 1.5 tons per hour. The pool capacity is 50 tons. How long will it take to fill the pool?"}
    ],
    "enable_thinking": true,
    "max_tokens": 4000
  }'`,
  vision: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen-vl-max",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "Describe what is in this image and recognize any text"},
          {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
        ]
      }
    ],
    "max_tokens": 1000
  }'`,
  coding: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [
      {"role": "system", "content": "You are a senior software engineer who excels at writing high-quality code."},
      {"role": "user", "content": "Implement an LRU cache class with TTL support in TypeScript"}
    ],
    "temperature": 0.3,
    "max_tokens": 4000
  }'`,
};

const pythonExamples: Record<CodeTabKey, string> = {
  basic: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3-max",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Briefly introduce the basic principles of quantum computing"},
    ],
    temperature=0.7,
    max_tokens=2000,
)

print(response.choices[0].message.content)`,
  reasoning: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# Reasoning models support enable_thinking; when enabled, the response includes the thinking process
response = client.chat.completions.create(
    model="qwq-plus",
    messages=[
        {"role": "user", "content": "A pool has two inlet pipes and one outlet pipe. Inlet A pumps 3 tons of water per hour, inlet B pumps 2 tons per hour, and the outlet drains 1.5 tons per hour. The pool capacity is 50 tons. How long will it take to fill the pool?"},
    ],
    extra_body={"enable_thinking": True},
    max_tokens=4000,
)

print(response.choices[0].message.content)`,
  vision: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen-vl-max",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe what is in this image and recognize any text"},
                {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}},
            ],
        }
    ],
    max_tokens=1000,
)

print(response.choices[0].message.content)`,
  coding: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3-coder-plus",
    messages=[
        {"role": "system", "content": "You are a senior software engineer who excels at writing high-quality code."},
        {"role": "user", "content": "Implement an LRU cache class with TTL support in TypeScript"},
    ],
    temperature=0.3,
    max_tokens=4000,
)

print(response.choices[0].message.content)`,
};

const protocolCurlExamples = [
  {
    title: "OpenAI Chat Completions",
    endpoint: "/v1/chat/completions",
    code: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-flash",
    "messages": [
      {"role": "user", "content": "Reply with only OK"}
    ],
    "max_tokens": 8
  }'`,
  },
  {
    title: "Anthropic Messages",
    endpoint: "/v1/messages",
    code: `curl -X POST '${API_BASE}/v1/messages' \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-flash",
    "max_tokens": 8,
    "messages": [
      {"role": "user", "content": "Reply with only OK"}
    ]
  }'`,
  },
  {
    title: "Gemini-compatible GenerateContent",
    endpoint: "/v1beta/models/qwen3.5-flash:generateContent",
    code: `curl -X POST '${API_BASE}/v1beta/models/qwen3.5-flash:generateContent' \\
  -H "x-goog-api-key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Reply with only OK"}]
      }
    ],
    "generationConfig": {
      "maxOutputTokens": 8
    }
  }'`,
  },
];

export default function QwenDocsPage() {
  const [modelTab, setModelTab] = useState<ModelTabKey>("llm");
  const [codeTab, setCodeTab] = useState<CodeTabKey>("basic");
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#ede9fe", color: "#6d28d9", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.5px", marginBottom: 12,
        }}>
          Qwen
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Qwen Series API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Qwen text, reasoning, vision and coding models can all be called through NexusFlow's three public-compatible protocols: OpenAI Chat Completions, Anthropic Messages, and Gemini-compatible GenerateContent. Examples below default to OpenAI Chat because it covers the broadest capability surface and has the lowest migration cost.
        </p>
      </div>

      {/* Protocols */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Protocols &amp; Endpoints</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Protocol</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Endpoint</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {qwenProtocols.map((row, i) => (
                <tr key={row.protocol} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{row.protocol}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{row.endpoint}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: row.status === "Available" ? "#dcfce7" : "#f3f4f6",
                      color: row.status === "Available" ? "#166534" : "#6b7280",
                    }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{row.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.7 }}>
          See the official Bailian API reference at{" "}
          <a href="https://help.aliyun.com/zh/model-studio/qwen-api-reference/" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            Alibaba Cloud Qwen API Reference
          </a>
          . This page only shows protocols currently available and directly callable via the NexusFlow public gateway.
        </p>
      </section>

      {/* Models Table */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Available Models</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {modelTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setModelTab(tab.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: modelTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: modelTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
                color: modelTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model ID</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Context</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Tier-1 Input ($/1M tokens)</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Tier-1 Output ($/1M tokens)</th>
              </tr>
            </thead>
            <tbody>
              {modelsByTab[modelTab].map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12 }}>{m.id}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{m.ctx}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{m.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
          Prices are per 1M tokens. The same model ID can be called via any of the protocols above; balance, billing and monitoring are shared across protocols.
        </p>
      </section>

      {/* Code Examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Request Examples</h2>

        {/* Code scenario tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {codeTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCodeTab(tab.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: codeTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: codeTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
                color: codeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Language switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["curl", "python"] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
                background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
                color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {lang === "curl" ? "cURL" : "Python"}
            </button>
          ))}
        </div>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[codeTab] : pythonExamples[codeTab]} />
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Three-protocol cURL Examples</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: -6, marginBottom: 16 }}>
          Qwen text models in NexusFlow share the same model IDs, API keys, balance, usage and billing records. The three examples below can all be called directly against the public gateway.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {protocolCurlExamples.map((example) => (
            <div key={example.title} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>{example.title}</strong>
                <code style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{example.endpoint}</code>
              </div>
              <div style={{ background: "#111827", padding: 18, overflow: "auto" }}>
                <DocsCodeBlock code={example.code} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Response Example */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Response Example</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "qwen3-max",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing is a way of processing information that leverages the principles of quantum mechanics..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 618,
    "total_tokens": 660
  }
}`} />
        </div>
      </section>

      {/* Special Parameters */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Special Parameters</h2>

        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #93c5fd",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af", marginBottom: 20,
        }}>
          <strong>Thinking-mode parameter</strong> — <code>enable_thinking</code> only matters for models that support a thinking toggle; reasoning-only models cannot disable it, and math-specific models should not pass this parameter by default.
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Parameter</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>Applicable Models</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 12 }}>enable_thinking</code>
                </td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>boolean</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>See table below</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  For mixed-thinking models, true returns reasoning_content; false reduces latency and output tokens. Reasoning-only models will continue to return reasoning_content regardless.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Observed Behavior</th>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["qwen3.5-flash", "true returns reasoning_content; false does not", "For low-cost scenarios, pass false explicitly"],
                ["qwen3-max", "true returns reasoning_content; false does not", "Use true for complex tasks, false for general chat"],
                ["qwq-plus", "Both true/false return reasoning_content", "Use as a reasoning-only model; do not expect false to disable it"],
                ["qwen-math-plus", "Neither true nor false returns reasoning_content", "Do not pass enable_thinking by default"],
              ].map((row) => (
                <tr key={row[0]} style={{ background: "var(--bg)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{row[0]}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row[1]}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Response example with thinking mode enabled</h3>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <DocsCodeBlock code={`{
  "id": "chatcmpl-thinking-xyz",
  "object": "chat.completion",
  "model": "qwq-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "It takes about 14.29 hours to fill the pool.",
        "reasoning_content": "Let me analyze this problem:\\nInflow rate = 3 + 2 = 5 tons/hour\\nOutflow rate = 1.5 tons/hour\\nNet inflow rate = 5 - 1.5 = 3.5 tons/hour\\nTime to fill = 50 / 3.5 ≈ 14.29 hours"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 68,
    "completion_tokens": 1024,
    "total_tokens": 1092
  }
}`} />
          </div>
        </div>
      </section>

      {/* Related Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/quickstart", label: "Quick Start", desc: "Make your first API call in 5 minutes" },
          { href: "/docs/multi-protocol", label: "Multi-protocol Integration", desc: "OpenAI / Anthropic / Gemini compatibility" },
          { href: "/docs/api/chat", label: "Chat Completions", desc: "Default chat API documentation" },
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
