"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const codeExamples: Record<string, string> = {
  python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, please introduce yourself."}
    ],
    temperature=0.7,
    max_tokens=1000
)

print(response.choices[0].message.content)`,
  nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello, please introduce yourself." }
  ],
  temperature: 0.7,
  max_tokens: 1000,
});

console.log(response.choices[0].message.content);`,
  curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, please introduce yourself."}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'`,
};

const asyncTaskExample = `curl -X POST ${API_BASE}/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-t2v",
    "prompt": "City coastline at dusk, slow dolly-in, cinematic natural light",
    "duration": 10,
    "resolution": "720P"
  }'

# Poll task status
curl ${API_BASE}/v1/tasks/task_xxx \\
  -H "Authorization: Bearer sk-air-your-key"`;

const protocols = [
  {
    title: "OpenAI-compatible",
    endpoint: `${API_BASE}/v1/chat/completions`,
    href: "/docs/api/chat",
    desc: "Recommended default. Ideal for the OpenAI SDK, Chat Completions, function calling, and streaming.",
  },
  {
    title: "Anthropic Messages",
    endpoint: `${API_BASE}/v1/messages`,
    href: "/docs/api/anthropic",
    desc: "Ideal if you already use the Anthropic SDK, the Messages request format, or Claude Code-style clients.",
  },
  {
    title: "Responses API",
    endpoint: `${API_BASE}/v1/responses`,
    href: "/docs/api/responses",
    desc: "Clean Responses API format with built-in tools and multi-turn conversation management.",
  },
];

export default function QuickstartPage() {
  const [lang, setLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Quick Start
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7 }}>
          Start with your first request, choose the OpenAI, Anthropic Messages, or Responses API protocol, and learn when to switch to async task mode.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {[
            { title: "Three Sync Protocols", desc: "OpenAI, Anthropic, and Responses compatible endpoints share the same models." },
            { title: "Async Tasks", desc: "Submit and poll image and video jobs through `/v1/tasks`." },
            { title: "Production Traffic", desc: "Review rate limits, error codes, and the monitoring page before launch." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Choose a Compatible Protocol
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {protocols.map((protocol) => (
            <Link key={protocol.title} href={protocol.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", textDecoration: "none", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{protocol.title}</div>
              <code style={{ display: "block", fontSize: 11.5, lineHeight: 1.5, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10, wordBreak: "break-all" }}>{protocol.endpoint}</code>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{protocol.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Prerequisites
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "var(--text-secondary)", lineHeight: 2.2 }}>
          <li><Link href="/login" style={{ color: "var(--accent)" }}>Signed up and signed in</Link> to the nexusflow platform</li>
          <li>Created at least one API Key on the <Link href="/keys" style={{ color: "var(--accent)" }}>API Keys</Link> page</li>
          <li>Added balance on the <Link href="/billing" style={{ color: "var(--accent)" }}>Billing</Link> page</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>1</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Install the SDK</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          Uses the OpenAI SDK by default. If you already have an Anthropic client or need the Responses API, see the corresponding protocol docs.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-tertiary)" }}>Python</div>
            <DocsCodeBlock code="pip install openai" />
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-tertiary)" }}>Node.js</div>
            <DocsCodeBlock code="npm install openai" />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>2</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Configure the API</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          Point base_url to nexusflow and use a single API Key to access all models.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)", width: 120 }}>Base URL</td>
                <td style={{ padding: "12px 16px" }}><code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{API_BASE}/v1</code></td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)" }}>API Key</td>
                <td style={{ padding: "12px 16px" }}>
                  <code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>sk-air-xxxxxxxx</code>
                  <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-tertiary)" }}>(<Link href="/keys" style={{ color: "var(--accent)" }}>Get a key</Link>)</span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)" }}>Authentication</td>
                <td style={{ padding: "12px 16px" }}><code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>Authorization: Bearer {"{API_KEY}"}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>3</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Make a Chat Request</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          Use the sync endpoint for text and reasoning models. The example below uses Qwen3.5 Plus.
        </p>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["python", "nodejs", "curl"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: "5px 14px",
                borderRadius: 4,
                border: "none",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                background: lang === l ? "#333" : "transparent",
                color: lang === l ? "#fff" : "var(--text-tertiary)",
              }}
            >
              {l === "python" ? "Python" : l === "nodejs" ? "Node.js" : "cURL"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={codeExamples[lang]} />
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>4</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Integrate Async Tasks</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          When you start integrating image or video generation, we recommend using <code>/v1/tasks</code>. This pipeline is better suited for high-latency models, background batch jobs, and high-concurrency queuing.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={asyncTaskExample} />
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          High-Concurrency Integration Tips
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            "Split chat requests and multimedia tasks into separate queues to avoid throughput contention.",
            "A single API Key works across the OpenAI, Anthropic Messages, and Responses API protocols.",
            "Poll tasks every 3-5 seconds and use exponential backoff for failed retries.",
            "Confirm the RPM / TPM and concurrency strategy on the rate limits page before load testing.",
          ].map((text) => (
            <div key={text} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              {text}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ padding: 20, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>Tips</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.9 }}>
            <li>Switch models by replacing the <code>model</code> parameter with another model ID</li>
            <li>All models share a single API Key — no separate applications needed</li>
            <li>The OpenAI, Anthropic Messages, and Responses API protocols share the same balance and usage records</li>
            <li>Streaming is supported — just set <code>stream: true</code></li>
            <li>Use <code>/v1/tasks</code> for image and video to avoid synchronous blocking</li>
          </ul>
        </div>
      </section>

      <section style={{ marginBottom: 36, padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>💡 Cost-saving tip: Context Cache</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
          For repeated system prompts or long document context, enable <code>enable_context_caching: true</code> (OpenAI protocol) or the <code>cache_control</code> annotation (Anthropic protocol). Cache hits are billed at only 10% of the input price. See <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>billing details</Link>.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Next Steps
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/models", label: "Browse Models", desc: "View all 45+ available models" },
            { href: "/docs/multi-protocol", label: "Three-Protocol Access", desc: "OpenAI / Anthropic / Responses compatibility guide" },
            { href: "/docs/api/tasks", label: "Async Tasks", desc: "Unified task API for image / video" },
            { href: "/docs/api/limits", label: "Rate Limits & Concurrency", desc: "Limits and optimization tips for high concurrency" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "16px 20px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)", transition: "all 0.15s" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
