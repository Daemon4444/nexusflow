"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const openaiPython = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# Basic chat
response = client.chat.completions.create(
    model="qwen3-max",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`;

const openaiNode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3-max",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`;

const openaiStream = `stream = client.chat.completions.create(
    model="qwen3-max",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`;

const openaiImage = `response = client.images.generate(
    model="wan2.6-t2i",
    prompt="A futuristic city at sunset, cyberpunk style",
    size="1024x1024",
    n=1,
)
print(response.data[0].url)`;

const openaiEmbedding = `response = client.embeddings.create(
    model="text-embedding-v4",
    input="Your text string goes here",
)
print(response.data[0].embedding[:5])`;

const anthropicPython = `import anthropic

client = anthropic.Anthropic(
    api_key="sk-air-your-key",
    base_url="${API_BASE}",
)

message = client.messages.create(
    model="qwen3-max",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)`;

const anthropicNode = `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}",
});

const message = await client.messages.create({
  model: "qwen3-max",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(message.content[0].text);`;

const anthropicStream = `with client.messages.stream(
    model="qwen3-max",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="")`;

const geminiPython = `from google import genai
from google.genai import types

client = genai.Client(
    api_key="sk-air-your-key",
    http_options=types.HttpOptions(
        api_version="v1beta",
        base_url="${API_BASE}",
    ),
)

response = client.models.generate_content(
    model="qwen-turbo",
    contents="Hello!",
)
print(response.text)`;

const protocolBoundaryRows = [
  { name: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", status: "Available", note: "Recommended default entry point for text, reasoning, multimodal, and coding models." },
  { name: "Anthropic Messages", endpoint: "/v1/messages", status: "Available", note: "Compatible with the Anthropic SDK and the Messages request / streaming-event format." },
  { name: "Gemini-compatible GenerateContent", endpoint: "/v1beta/models/{model}:generateContent", status: "Available", note: "Compatible with Google GenAI / Gemini GenerateContent request formats." },
  { name: "OpenAI Image Generations", endpoint: "/v1/images/generations", status: "Available", note: "Synchronous compatibility entry for image generation; complex image / video tasks can use /v1/tasks." },
  { name: "OpenAI Embeddings", endpoint: "/v1/embeddings", status: "Available", note: "Entry point for text embedding models." },
  { name: "NexusFlow Tasks", endpoint: "/v1/tasks", status: "Available", note: "Unified entry for image and video async tasks." },
];

export default function MultiProtocolPage() {
  const [openaiLang, setOpenaiLang] = useState("python");
  const [anthropicLang, setAnthropicLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Feature</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Multi-Protocol Support
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          Use familiar SDKs against a single gateway with shared auth, billing, and monitoring.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow exposes three public protocols today: OpenAI, Anthropic Messages, and Gemini-compatible GenerateContent.
          Internally, all three are wired through a compatibility layer onto the same model routing, billing, and monitoring pipeline. The goal is to let you keep using familiar SDKs without leaking provider differences into your application.
          Note that &quot;Gemini-compatible&quot; refers to the request / response format only—the platform does not host Google&apos;s native Gemini models.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Supported Protocols</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Endpoint prefix</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Matching SDK</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Primary use</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", sdk: "OpenAI SDK", usage: "Text chat and tool calls" },
                { proto: "OpenAI Image Generations", endpoint: "/v1/images/generations", sdk: "OpenAI SDK", usage: "Image generation" },
                { proto: "OpenAI Embeddings", endpoint: "/v1/embeddings", sdk: "OpenAI SDK", usage: "Text embeddings" },
                { proto: "Anthropic Messages", endpoint: "/v1/messages", sdk: "Anthropic SDK", usage: "Text chat and tool calls" },
                { proto: "Gemini-compatible GenerateContent", endpoint: "/v1beta/models/{model}:generateContent", sdk: "Google GenAI SDK / HTTP", usage: "Text chat format compatibility" },
              ].map((row, idx) => (
                <tr key={row.proto} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.proto}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.endpoint}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.sdk}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          Not every model supports every protocol. The model detail page shows the model&apos;s current <code style={{ fontFamily: "var(--font-mono)" }}>supported_protocols</code>.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Protocol Scope</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          The NexusFlow public API only lists compatibility entry points that can be called directly. The model detail page shows the actual supported_protocols enabled for each model.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol / Endpoint</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Path</th>
                <th style={{ padding: "11px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {protocolBoundaryRows.map((row, idx) => (
                <tr key={row.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.endpoint}</code>
                  </td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: row.status === "Available" ? "#dcfce7" : "#f3f4f6",
                      color: row.status === "Available" ? "#166534" : "#6b7280",
                    }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.65 }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          Reference: <a href="https://help.aliyun.com/zh/model-studio/qwen-api-reference/" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Alibaba Cloud Bailian Qwen API Reference</a>.
        </p>
      </section>

      {/* OpenAI Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          OpenAI Protocol
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          The most universal protocol—supported by most models. Compatible with the OpenAI Chat Completions API spec.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Basic Setup</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {["python", "nodejs"].map((l) => (
            <button key={l} onClick={() => setOpenaiLang(l)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: openaiLang === l ? "#333" : "transparent",
              color: openaiLang === l ? "#fff" : "var(--text-tertiary)",
            }}>
              {l === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiLang === "python" ? openaiPython : openaiNode} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Streaming</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiStream} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Image Generation</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Models that support the <code style={{ fontFamily: "var(--font-mono)" }}>openai:image-generations</code> protocol can generate images via the OpenAI SDK.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiImage} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Text Embeddings</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Models that support the <code style={{ fontFamily: "var(--font-mono)" }}>openai:embeddings</code> protocol can convert text into vector representations for semantic search, clustering, RAG, and more.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={openaiEmbedding} />
        </div>
      </section>

      {/* Anthropic Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Anthropic Protocol
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          A compatibility entry for the Anthropic Messages API—use the Anthropic SDK to integrate with the unified nexusflow gateway directly.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Basic Setup</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {["python", "nodejs"].map((l) => (
            <button key={l} onClick={() => setAnthropicLang(l)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: anthropicLang === l ? "#333" : "transparent",
              color: anthropicLang === l ? "#fff" : "var(--text-tertiary)",
            }}>
              {l === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={anthropicLang === "python" ? anthropicPython : anthropicNode} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Streaming</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={anthropicStream} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Gemini-Compatible Protocol
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          A Google GenAI-style <code style={{ fontFamily: "var(--font-mono)" }}>/v1beta/models/{"{model}"}:generateContent</code> compatibility entry,
          ideal when you want to keep using the Gemini SDK. The <code style={{ fontFamily: "var(--font-mono)" }}>model</code> in the path is a NexusFlow model ID
          (for example <code style={{ fontFamily: "var(--font-mono)" }}>qwen-turbo</code>), not a native Google Gemini model name.
          Currently focused on <code style={{ fontFamily: "var(--font-mono)" }}>generateContent</code> and <code style={{ fontFamily: "var(--font-mono)" }}>streamGenerateContent</code>.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={geminiPython} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Protocol Selection Tips</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {[
            "If you're using DeepSeek, Qwen, GLM, or other Chinese models, the OpenAI protocol is recommended for best compatibility.",
            "If you're already on the Anthropic SDK, prefer /v1/messages to minimize SDK migration cost.",
            "If your app already uses the Google GenAI SDK, you can use /v1beta/models/{model}:generateContent—but the model field still takes a NexusFlow model ID.",
            "Check supported_protocols on the model detail page to see which protocols are currently enabled for that model.",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>{i + 1}.</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "Quick Start", desc: "Get up and running fast" },
            { href: "/docs/api-keys", label: "API Keys", desc: "Create and manage keys" },
            { href: "/docs/models", label: "Model Catalog", desc: "See which protocols each model supports" },
            { href: "/docs/provider-routing", label: "Provider Routing", desc: "How smart routing works" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
