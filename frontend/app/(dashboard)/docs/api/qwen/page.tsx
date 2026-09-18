"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type ModelTabKey = "llm" | "reasoning" | "vision";
type CodeTabKey = "basic" | "reasoning" | "vision";

const modelTabs: { key: ModelTabKey; label: string }[] = [
  { key: "llm", label: "大语言" },
  { key: "reasoning", label: "推理" },
  { key: "vision", label: "视觉" },
];

const codeTabs: { key: CodeTabKey; label: string }[] = [
  { key: "basic", label: "基础对话" },
  { key: "reasoning", label: "推理模式" },
  { key: "vision", label: "视觉理解" },
];

const qwenProtocols = [
  {
    protocol: "OpenAI Chat Completions",
    endpoint: "/v1/chat/completions",
    status: "已开放",
    usage: "默认示例入口，支持 OpenAI SDK、流式输出、工具调用、视觉输入和推理字段。",
  },
  {
    protocol: "Anthropic Messages",
    endpoint: "/v1/messages",
    status: "已开放",
    usage: "适合复用 Anthropic SDK 或 Messages 格式；model 仍填写 NexusFlow 的 Qwen 模型 ID。",
  },
  {
    protocol: "Responses API",
    endpoint: "/v1/responses",
    status: "已开放",
    usage: "默认支持函数工具与 previous_response_id 多轮上下文；其他受管工具需单独开通。",
  },
];

const modelsByTab: Record<ModelTabKey, { id: string; ctx: string; input: string; output: string }[]> = {
  llm: [
    { id: "qwen3.8-max", ctx: "1M", input: "¥12/M", output: "¥36/M" },
    { id: "qwen3.8-flash", ctx: "1M", input: "¥0.8/M", output: "¥2.7/M" },
    { id: "qwen3.7-max", ctx: "1M", input: "¥12/M", output: "¥36/M" },
    { id: "qwen3-max", ctx: "256K", input: "¥2.5/M", output: "¥10/M" },
    { id: "qwen3.6-max-preview", ctx: "256K", input: "¥9/M", output: "¥54/M" },
    { id: "qwen3.6-plus", ctx: "1M", input: "¥2/M", output: "¥12/M" },
    { id: "qwen3.7-flash", ctx: "1M", input: "¥0.2/M", output: "¥0.8/M" },
    { id: "qwen3.6-flash", ctx: "1M", input: "¥1.2/M", output: "¥7.2/M" },
    { id: "qwen3.5-plus", ctx: "1M", input: "¥0.8/M", output: "¥4.8/M" },
    { id: "qwen3.5-flash", ctx: "1M", input: "¥0.2/M", output: "¥2/M" },
    { id: "qwen-plus", ctx: "1M", input: "¥0.8/M", output: "¥2/M" },
    { id: "qwen-flash", ctx: "1M", input: "¥0.15–1.2/M（三档）", output: "¥1.5–12/M（三档）" },
    { id: "qwen-long", ctx: "10M", input: "¥0.5/M", output: "¥2/M" },
    { id: "qwen-turbo", ctx: "128K", input: "¥0.3/M", output: "¥0.6/M（思考 ¥3/M）" },
  ],
  reasoning: [
    { id: "qwq-plus", ctx: "128K", input: "¥1.6/M", output: "¥4/M" },
    { id: "qwen-math-plus", ctx: "4K", input: "¥4/M", output: "¥12/M" },
  ],
  vision: [
    { id: "qwen3.8-max", ctx: "1M", input: "¥12/M", output: "¥36/M" },
    { id: "qwen3.8-flash", ctx: "1M", input: "¥0.8/M", output: "¥2.7/M" },
    { id: "qwen3.5-omni-plus", ctx: "256K", input: "¥7/M", output: "¥40/M" },
    { id: "qwen3.5-omni-flash", ctx: "256K", input: "¥2.2/M", output: "¥13.3/M" },
    { id: "qwen3-omni-flash", ctx: "64K", input: "¥1.8/M", output: "¥6.9/M" },
    { id: "qwen3.7-flash", ctx: "1M", input: "¥0.2/M", output: "¥0.8/M" },
    { id: "qwen3.7-plus", ctx: "1M", input: "¥2/M", output: "¥8/M" },
    { id: "qwen-vl-max", ctx: "128K", input: "¥1.6/M", output: "¥4/M" },
    { id: "qwen-vl-plus", ctx: "128K", input: "¥0.8/M", output: "¥2/M" },
    { id: "qwen3-vl-plus", ctx: "256K", input: "¥1/M", output: "¥10/M" },
    { id: "qwen3-vl-flash", ctx: "256K", input: "¥0.15/M", output: "¥1.5/M" },
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
      {"role": "user", "content": "只回复 OK"}
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
      {"role": "user", "content": "只回复 OK"}
    ]
  }'`,
  },
  {
    title: "Responses API",
    endpoint: "/v1/responses",
    code: `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-flash",
    "input": "只回复 OK"
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
          通义千问 / Qwen
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Qwen 系列模型 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Qwen 文本、推理、视觉理解和编程模型可通过 NexusFlow 的三类公共兼容协议调用：OpenAI Chat Completions、Anthropic Messages、Responses API。下方请求示例默认使用 OpenAI Chat，因为它覆盖能力最完整、迁移成本最低。
        </p>
      </div>

      {/* Protocols */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>协议与端点</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>协议</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>端点</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>状态</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
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
                      background: row.status === "已开放" ? "#dcfce7" : "#f3f4f6",
                      color: row.status === "已开放" ? "#166534" : "#6b7280",
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
          本页展示当前 NexusFlow 公共网关已开放、可直接调用的协议。
        </p>
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
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>首阶输入 (¥/1M tokens)</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>首阶输出 (¥/1M tokens)</th>
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
          价格为每 100 万 tokens 的人民币价格。同一模型 ID 可按上方已开放协议调用；不同协议共享同一套余额、计费和监控。
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
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[codeTab] : pythonExamples[codeTab]} />
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>三协议 cURL 示例</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: -6, marginBottom: 16 }}>
          Qwen 文本类模型在 NexusFlow 中共享同一套模型 ID、API Key、余额、用量和扣费记录。下面三个示例均可直接请求公开网关。
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>响应示例</h2>
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
}`} />
        </div>
      </section>

      {/* Special Parameters */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>特殊参数</h2>

        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #93c5fd",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af", marginBottom: 20,
        }}>
          <strong>思考模式参数</strong> — <code>enable_thinking</code> 只对支持思考开关的模型有意义；仅思考模型无法关闭，数学专用模型不要默认传该参数。
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>适用模型</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 12 }}>enable_thinking</code>
                </td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>boolean</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>见下表</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  混合思考模型传 true 会返回 reasoning_content，传 false 可降低延迟和输出 token；仅思考模型会继续返回 reasoning_content。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>线上实测行为</th>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>建议</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["qwen3.5-flash", "true 返回 reasoning_content；false 不返回", "低成本场景显式传 false"],
                ["qwen3-max", "true 返回 reasoning_content；false 不返回", "复杂任务传 true，普通对话传 false"],
                ["qwq-plus", "true/false 都返回 reasoning_content", "按仅思考模型使用，不要指望 false 关闭"],
                ["qwen-math-plus", "true/false 均未返回 reasoning_content", "不要默认传 enable_thinking"],
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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>启用思考模式的响应示例</h3>
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
        "content": "水池注满需要约 14.29 小时。",
        "reasoning_content": "让我分析这道题：\\n进水速率 = 3 + 2 = 5 吨/小时\\n出水速率 = 1.5 吨/小时\\n净进水速率 = 5 - 1.5 = 3.5 吨/小时\\n注满时间 = 50 / 3.5 ≈ 14.29 小时"
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
          { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟完成首次 API 调用" },
          { href: "/docs/multi-protocol", label: "多协议接入", desc: "查看 OpenAI / Anthropic / Responses 兼容说明" },
          { href: "/docs/api/chat", label: "Chat Completions", desc: "查看默认对话接口文档" },
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
