"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type ModelTabKey = "llm" | "reasoning" | "vision" | "coding";
type CodeTabKey = "basic" | "reasoning" | "vision" | "coding";

const modelTabs: { key: ModelTabKey; label: string }[] = [
  { key: "llm", label: "大语言" },
  { key: "reasoning", label: "推理" },
  { key: "vision", label: "视觉" },
  { key: "coding", label: "编程" },
];

const codeTabs: { key: CodeTabKey; label: string }[] = [
  { key: "basic", label: "基础对话" },
  { key: "reasoning", label: "推理模式" },
  { key: "vision", label: "视觉理解" },
  { key: "coding", label: "编程" },
];

const modelsByTab: Record<ModelTabKey, { id: string; ctx: string; input: string; output: string }[]> = {
  llm: [
    { id: "qwen3-max", ctx: "131K", input: "¥2.5/M", output: "¥10/M" },
    { id: "qwen3.6-max-preview", ctx: "256K", input: "¥9/M", output: "¥54/M" },
    { id: "qwen3.6-plus", ctx: "1M", input: "¥2/M", output: "¥12/M" },
    { id: "qwen3.5-plus", ctx: "1M", input: "¥0.8/M", output: "¥4.8/M" },
    { id: "qwen3.5-flash", ctx: "1M", input: "¥0.2/M", output: "¥2/M" },
    { id: "qwen-plus", ctx: "131K", input: "¥0.8/M", output: "¥2/M" },
    { id: "qwen-turbo", ctx: "131K", input: "¥0.3/M", output: "¥0.6/M" },
  ],
  reasoning: [
    { id: "qwq-plus", ctx: "131K", input: "¥1/M", output: "¥4/M" },
    { id: "qwen-math-plus", ctx: "4K", input: "¥4/M", output: "¥12/M" },
  ],
  vision: [
    { id: "qwen-vl-max", ctx: "32K", input: "¥3/M", output: "¥9/M" },
    { id: "qwen-vl-plus", ctx: "32K", input: "¥1.5/M", output: "¥4.5/M" },
    { id: "qwen3-vl-plus", ctx: "262K", input: "¥1/M", output: "¥10/M" },
  ],
  coding: [
    { id: "qwen3-coder-plus", ctx: "1M", input: "¥4/M", output: "¥16/M" },
    { id: "qwen3-coder-flash", ctx: "131K", input: "免费", output: "免费" },
  ],
};

const curlExamples: Record<CodeTabKey, string> = {
  basic: `curl -X POST '${API_BASE}/v1/chat/completions' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3-max",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手。"},
      {"role": "user", "content": "简要介绍一下量子计算的基本原理"}
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
      {"role": "user", "content": "一个水池有两个进水管和一个出水管。进水管A每小时注入3吨水，进水管B每小时注入2吨水，出水管每小时排出1.5吨水。水池容量为50吨，问多久能注满？"}
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
          {"type": "text", "text": "描述这张图片的内容，并识别其中的文字"},
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
      {"role": "system", "content": "你是一个资深软件工程师，擅长编写高质量代码。"},
      {"role": "user", "content": "用 TypeScript 实现一个支持过期时间的 LRU 缓存类"}
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
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "简要介绍一下量子计算的基本原理"},
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

# 推理模型支持 enable_thinking 参数，开启后返回思考过程
response = client.chat.completions.create(
    model="qwq-plus",
    messages=[
        {"role": "user", "content": "一个水池有两个进水管和一个出水管。进水管A每小时注入3吨水，进水管B每小时注入2吨水，出水管每小时排出1.5吨水。水池容量为50吨，问多久能注满？"},
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
                {"type": "text", "text": "描述这张图片的内容，并识别其中的文字"},
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
        {"role": "system", "content": "你是一个资深软件工程师，擅长编写高质量代码。"},
        {"role": "user", "content": "用 TypeScript 实现一个支持过期时间的 LRU 缓存类"},
    ],
    temperature=0.3,
    max_tokens=4000,
)

print(response.choices[0].message.content)`,
};

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
          通义千问 / Qwen
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Qwen 系列模型 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          通过 OpenAI 兼容的 Chat Completions 接口调用 Qwen 全系列模型，涵盖大语言、推理、视觉理解、编程等能力。支持流式输出、函数调用，可直接使用 OpenAI SDK 接入。
        </p>
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求端点</h2>
        <div style={{
          padding: "14px 18px", background: "var(--bg-elevated)", borderRadius: 10,
          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "#dbeafe", color: "#1d4ed8",
          }}>POST</span>
          <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{API_BASE}/v1/chat/completions</code>
        </div>
      </section>

      {/* Models Table */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>可用模型</h2>
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
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入 (¥/1M tokens)</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出 (¥/1M tokens)</th>
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
          价格为每 100 万 tokens 的人民币价格。所有模型均通过同一端点调用，仅需更换 model 参数。
        </p>
      </section>

      {/* Code Examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求示例</h2>

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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
            {codeLang === "curl" ? curlExamples[codeTab] : pythonExamples[codeTab]}
          </pre>
        </div>
      </section>

      {/* Response Example */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>响应示例</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "qwen3-max",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "量子计算是一种利用量子力学原理进行信息处理的计算方式..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 618,
    "total_tokens": 660
  }
}`}
          </pre>
        </div>
      </section>

      {/* Special Parameters */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>特殊参数</h2>

        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #93c5fd",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af", marginBottom: 20,
        }}>
          <strong>推理模型专属参数</strong> — 以下参数仅适用于推理系列模型（qwq-plus、qwen-math-plus 等）。
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 60 }}>默认值</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 12 }}>enable_thinking</code>
                </td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>boolean</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>false</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  开启后，模型会在回答前先进行深度思考，并在响应中返回思考过程（thinking_content）。适合复杂数学、逻辑推理、多步分析等场景。开启后 token 用量会显著增加。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>启用思考模式的响应示例</h3>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "id": "chatcmpl-thinking-xyz",
  "object": "chat.completion",
  "model": "qwq-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "水池注满需要约 14.29 小时。",
        "thinking_content": "让我分析这道题：\\n进水速率 = 3 + 2 = 5 吨/小时\\n出水速率 = 1.5 吨/小时\\n净进水速率 = 5 - 1.5 = 3.5 吨/小时\\n注满时间 = 50 / 3.5 ≈ 14.29 小时"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 68,
    "completion_tokens": 1024,
    "total_tokens": 1092
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* Related Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟完成首次 API 调用" },
          { href: "/docs/api/chat", label: "Chat Completions", desc: "查看通用对话补全接口文档" },
          { href: "/pricing", label: "完整定价", desc: "查看所有模型定价详情" },
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
