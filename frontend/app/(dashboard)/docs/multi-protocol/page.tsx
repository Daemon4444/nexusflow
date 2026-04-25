"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const openaiPython = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# 基本对话
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
    model="text-embedding-v3",
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
    model="qwen3-max",
    contents="Hello!",
)
print(response.text)`;

export default function MultiProtocolPage() {
  const [openaiLang, setOpenaiLang] = useState("python");
  const [anthropicLang, setAnthropicLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>功能</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          多协议支持
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          使用熟悉的 SDK 直接接入同一网关，统一鉴权、统一计费、统一监控
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow 当前对外统一提供三类 public protocol：OpenAI、Anthropic Messages 和 Google Gemini GenerateContent。
          这些协议在平台内通过兼容层接到同一套模型路由、计费和监控链路上，目标是让你可以继续使用熟悉的 SDK，同时不把供应商差异泄漏到业务侧。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持的协议</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>协议</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>端点前缀</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>对应 SDK</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>主要用途</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", sdk: "OpenAI SDK", usage: "文本对话、工具调用" },
                { proto: "OpenAI Image Generations", endpoint: "/v1/images/generations", sdk: "OpenAI SDK", usage: "图像生成" },
                { proto: "OpenAI Embeddings", endpoint: "/v1/embeddings", sdk: "OpenAI SDK", usage: "文本向量化" },
                { proto: "Anthropic Messages", endpoint: "/v1/messages", sdk: "Anthropic SDK", usage: "文本对话、工具调用" },
                { proto: "Google Gemini", endpoint: "/v1beta/models/*", sdk: "Google GenAI SDK", usage: "文本对话、多模态" },
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
          不是所有模型都支持所有协议。模型详情页会直接展示该模型当前可用的 <code style={{ fontFamily: "var(--font-mono)" }}>supported_protocols</code>。
        </p>
      </section>

      {/* OpenAI Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          OpenAI 协议
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          这是最通用的协议，大多数模型都支持。兼容 OpenAI Chat Completions API 规范。
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>基本配置</h3>
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
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>
            {openaiLang === "python" ? openaiPython : openaiNode}
          </pre>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>流式输出</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{openaiStream}</pre>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>图像生成</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          支持 <code style={{ fontFamily: "var(--font-mono)" }}>openai:image-generations</code> 协议的模型可以通过 OpenAI SDK 生成图像。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{openaiImage}</pre>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>文本向量化</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          支持 <code style={{ fontFamily: "var(--font-mono)" }}>openai:embeddings</code> 协议的模型可以将文本转为向量表示，用于语义搜索、聚类、RAG 等场景。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{openaiEmbedding}</pre>
        </div>
      </section>

      {/* Anthropic Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Anthropic 协议
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          提供 Anthropic Messages 兼容入口，便于使用 Anthropic SDK 直接接入 nexusflow 的统一模型网关。
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>基本配置</h3>
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
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>
            {anthropicLang === "python" ? anthropicPython : anthropicNode}
          </pre>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>流式输出</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{anthropicStream}</pre>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Google Gemini 协议
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          提供 Google GenAI 风格的 <code style={{ fontFamily: "var(--font-mono)" }}>/v1beta/models/*</code> 兼容入口，
          适合需要沿用 Gemini SDK 的场景。当前以 <code style={{ fontFamily: "var(--font-mono)" }}>generateContent</code>
          与 <code style={{ fontFamily: "var(--font-mono)" }}>streamGenerateContent</code> 为主。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{geminiPython}</pre>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>协议选择建议</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {[
            "如果你使用的是 DeepSeek、Qwen、GLM 等国产模型，推荐使用 OpenAI 协议，兼容性最好。",
            "如果你已经在用 Anthropic SDK，可以优先使用 /v1/messages，减少 SDK 迁移成本。",
            "如果你的应用已经基于 Google GenAI SDK，优先使用 /v1beta/models/*。",
            "在模型详情页查看 supported_protocols，确认该模型当前开放了哪些协议。",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>{i + 1}.</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>相关文档</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "快速开始", desc: "快速上手调用模型" },
            { href: "/docs/api-keys", label: "API 密钥", desc: "创建和管理密钥" },
            { href: "/docs/models", label: "模型列表", desc: "查看模型支持的协议" },
            { href: "/docs/provider-routing", label: "供应商路由", desc: "了解智能路由机制" },
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
