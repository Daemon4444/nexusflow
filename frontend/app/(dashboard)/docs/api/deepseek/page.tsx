"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "chat" | "reasoning";

const models = [
  { id: "deepseek-v4-pro", category: "Reasoning", context: "1M", input: 12, output: 24, desc: "V4 flagship reasoning model" },
  { id: "deepseek-v4-flash", category: "Language", context: "1M", input: 1, output: 2, desc: "V4 high-speed chat model" },
  { id: "deepseek-v3.2", category: "Language", context: "131K", input: 2, output: 3, desc: "V3.2 general-purpose model" },
  { id: "deepseek-r1", category: "Reasoning", context: "65K", input: 4, output: 16, desc: "R1 reasoning model" },
  { id: "deepseek-v3", category: "Language", context: "65K", input: 2, output: 8, desc: "V3 general-purpose model" },
];

const curlExamples: Record<TabKey, string> = {
  chat: `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "user", "content": "Write a quicksort in Python"}
    ],
    "stream": true
  }'`,
  reasoning: `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-r1",
    "messages": [
      {"role": "user", "content": "A pool has two inlet pipes and one outlet pipe. Inlet A pumps 3 tons per hour, inlet B pumps 2 tons per hour, and the outlet drains 1.5 tons per hour. The pool capacity is 20 tons; starting from empty, how long until it is full?"}
    ],
    "stream": true,
    "enable_thinking": true
  }'`,
};

const pythonExamples: Record<TabKey, string> = {
  chat: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "user", "content": "Write a quicksort in Python"}
    ],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`,
  reasoning: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="deepseek-r1",
    messages=[
        {"role": "user", "content": "Prove that the square root of 2 is irrational"}
    ],
    stream=True,
    extra_body={"enable_thinking": True},
)

for chunk in response:
    delta = chunk.choices[0].delta
    # reasoning_content contains the thinking process
    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
        print(f"[Thinking] {delta.reasoning_content}", end="")
    if delta.content:
        print(delta.content, end="")`,
};

const protocolCurlExamples = [
  {
    title: "OpenAI Chat Completions",
    endpoint: "/v1/chat/completions",
    code: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4-flash",
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
    "model": "deepseek-v4-flash",
    "max_tokens": 8,
    "messages": [
      {"role": "user", "content": "Reply with only OK"}
    ]
  }'`,
  },
  {
    title: "Gemini-compatible GenerateContent",
    endpoint: "/v1beta/models/deepseek-v4-flash:generateContent",
    code: `curl -X POST '${API_BASE}/v1beta/models/deepseek-v4-flash:generateContent' \\
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

export default function DeepSeekApiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#f0f9ff", color: "#0369a1", fontSize: 11, fontWeight: 700,
          marginBottom: 12,
        }}>
          DeepSeek
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          DeepSeek Series API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          DeepSeek-series models accessed via Bailian, with reasoning mode and streaming support. Text-only DeepSeek models can be invoked through three public-compatible protocols: OpenAI Chat Completions, Anthropic Messages, and Gemini-compatible GenerateContent.
        </p>
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 32 }}>
        <div style={{
          padding: "12px 18px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>POST</span>
          <code style={{ fontSize: 14 }}>{API_BASE}/v1/chat/completions</code>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.7 }}>
          This is the default example endpoint. For multi-protocol calling, see <Link href="/docs/multi-protocol" style={{ color: "var(--accent)" }}>Multi-protocol Support</Link>,
          <Link href="/docs/api/anthropic" style={{ color: "var(--accent)" }}> Anthropic Messages</Link> and
          <Link href="/docs/api/gemini" style={{ color: "var(--accent)" }}> Gemini-compatible</Link>.
        </p>
      </section>

      {/* Models table */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Context</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Input / 1M</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Output / 1M</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{m.id}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.category}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.context}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>${m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>${m.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Request Examples</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {([["chat", "Basic Chat"], ["reasoning", "Reasoning Mode"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
              border: activeTab === key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
              background: activeTab === key ? "var(--accent-bg)" : "var(--bg)",
              color: activeTab === key ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "inherit",
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["curl", "python"] as const).map(lang => (
            <button key={lang} onClick={() => setCodeLang(lang)} style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
              background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
              color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
            }}>
              {lang === "curl" ? "cURL" : "Python"}
            </button>
          ))}
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Three-protocol cURL Examples</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: -4, marginBottom: 16 }}>
          DeepSeek text models share the same NexusFlow model IDs, API keys, balance, usage and billing records.
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

      {/* Reasoning mode */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Reasoning Mode Notes</h2>
        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af", marginBottom: 16,
        }}>
          DeepSeek R1 is a reasoning-only model: even with <code>enable_thinking=false</code>, it still returns reasoning_content.
          DeepSeek V3.2 and V4 Pro are verified mixed-thinking models that can be controlled via the <code>enable_thinking</code> toggle.
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={`// In reasoning mode, the delta contains a reasoning_content field
{
  "choices": [{
    "delta": {
      "reasoning_content": "Let me analyze this problem step by step...",
      "content": ""
    }
  }]
}

// After thinking is complete, switch to the final answer
{
  "choices": [{
    "delta": {
      "reasoning_content": "",
      "content": "Based on the analysis, the answer is..."
    }
  }]
}`} />
        </div>
      </section>

      {/* Related links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "Full chat API documentation" },
          { href: "/docs/api/errors", label: "Error Codes", desc: "Error handling and retry strategies" },
          { href: "/pricing", label: "Full Pricing", desc: "View pricing for all models" },
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
