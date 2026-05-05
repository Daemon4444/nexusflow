"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "chat" | "reasoning";

const models = [
  { id: "deepseek-v4-pro", category: "推理模型", context: "1M", input: 12, output: 24, desc: "V4 旗舰推理模型" },
  { id: "deepseek-v4-flash", category: "大语言模型", context: "1M", input: 1, output: 2, desc: "V4 高速对话模型" },
  { id: "deepseek-v3.2", category: "大语言模型", context: "131K", input: 2, output: 3, desc: "V3.2 通用模型" },
  { id: "deepseek-r1", category: "推理模型", context: "65K", input: 4, output: 16, desc: "R1 推理模型" },
  { id: "deepseek-v3", category: "大语言模型", context: "65K", input: 2, output: 8, desc: "V3 通用模型" },
];

const curlExamples: Record<TabKey, string> = {
  chat: `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "user", "content": "用 Python 写一个快速排序"}
    ],
    "stream": true
  }'`,
  reasoning: `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-r1",
    "messages": [
      {"role": "user", "content": "一个水池有两个进水管和一个出水管，进水管A每小时进3吨水，进水管B每小时进2吨水，出水管每小时排1.5吨水。水池容量20吨，从空池开始多久能装满？"}
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
        {"role": "user", "content": "用 Python 写一个快速排序"}
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
        {"role": "user", "content": "证明根号2是无理数"}
    ],
    stream=True,
    extra_body={"enable_thinking": True},
)

for chunk in response:
    delta = chunk.choices[0].delta
    # reasoning_content 包含思考过程
    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
        print(f"[思考] {delta.reasoning_content}", end="")
    if delta.content:
        print(delta.content, end="")`,
};

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
          DeepSeek / 深度求索
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          DeepSeek 系列模型 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          百炼接入的 DeepSeek 系列模型，兼容 OpenAI SDK，支持推理模式（展示完整思考链路）。所有模型统一走 Chat Completions 接口。
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
      </section>

      {/* Models table */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>模型列表</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入/百万</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出/百万</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{m.id}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.category}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.context}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>¥{m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>¥{m.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>请求示例</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {([["chat", "基础对话"], ["reasoning", "推理模式"]] as const).map(([key, label]) => (
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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
            {codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]}
          </pre>
        </div>
      </section>

      {/* Reasoning mode */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>推理模式说明</h2>
        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af", marginBottom: 16,
        }}>
          DeepSeek R1 和 V4 Pro 支持推理模式，会在回答前展示完整的思考过程（reasoning_content）。
          设置 <code>enable_thinking: true</code> 开启。
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`// 推理模式响应中，delta 包含 reasoning_content 字段
{
  "choices": [{
    "delta": {
      "reasoning_content": "让我一步步分析这个问题...",
      "content": ""
    }
  }]
}

// 思考完成后，切换到正式回答
{
  "choices": [{
    "delta": {
      "reasoning_content": "",
      "content": "根据分析，答案是..."
    }
  }]
}`}
          </pre>
        </div>
      </section>

      {/* Related links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "查看完整对话接口文档" },
          { href: "/docs/api/errors", label: "错误码参考", desc: "查看错误处理和重试策略" },
          { href: "/pricing", label: "完整定价", desc: "查看所有模型价格" },
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
