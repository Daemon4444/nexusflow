"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const models = [
  { id: "kimi-k2.6", context: "262K", input: 6.5, output: 27, desc: "K2.6 旗舰，长文本创意写作" },
  { id: "kimi-k2.5", context: "131K", input: 4, output: 21, desc: "K2.5 均衡模型" },
];

const curlExample = `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k2.6",
    "messages": [
      {"role": "user", "content": "帮我把这篇3000字的文章概括成300字的摘要"}
    ],
    "stream": true
  }'`;

const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[
        {"role": "user", "content": "帮我把这篇3000字的文章概括成300字的摘要"}
    ],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`;

export default function KimiApiPage() {
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#f5f3ff", color: "#6d28d9", fontSize: 11, fontWeight: 700, marginBottom: 12,
        }}>
          月之暗面 / Moonshot
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Kimi 系列模型 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          月之暗面 Kimi 系列模型，擅长长文本理解、多轮对话和创意写作。本文示例默认使用 OpenAI Chat Completions；同一模型 ID 也可按模型支持情况通过 Anthropic Messages 或 Gemini-compatible 协议调用。
        </p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <div style={{
          padding: "12px 18px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>POST</span>
          <code style={{ fontSize: 14 }}>{API_BASE}/v1/chat/completions</code>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.7 }}>
          这是默认示例端点。多协议调用方式见 <Link href="/docs/multi-protocol" style={{ color: "var(--accent)" }}>多协议支持</Link>、
          <Link href="/docs/api/anthropic" style={{ color: "var(--accent)" }}> Anthropic Messages</Link> 和
          <Link href="/docs/api/gemini" style={{ color: "var(--accent)" }}> Gemini-compatible</Link>。
        </p>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>模型列表</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入/百万</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出/百万</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{m.id}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.desc}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.context}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>¥{m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>¥{m.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>请求示例</h2>
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
            {codeLang === "curl" ? curlExample : pythonExample}
          </pre>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "查看完整对话接口文档" },
          { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟接入指南" },
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
