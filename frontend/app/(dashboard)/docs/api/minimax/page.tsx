"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const models = [
  { id: "MiniMax-M2.5", context: "131K", input: 2.1, output: 8.4, desc: "M2.5 增强版，推理编程" },
  { id: "MiniMax-M2.1", context: "131K", input: 2.1, output: 8.4, desc: "M2.1 创意写作对话" },
];

const curlExample = `curl ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "MiniMax-M2.5",
    "messages": [
      {"role": "user", "content": "写一个关于时间旅行者的短篇科幻故事开头"}
    ],
    "stream": true
  }'`;

const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="MiniMax-M2.5",
    messages=[
        {"role": "user", "content": "写一个关于时间旅行者的短篇科幻故事开头"}
    ],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`;

export default function MiniMaxApiPage() {
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#fdf2f8", color: "#be185d", fontSize: 11, fontWeight: 700, marginBottom: 12,
        }}>
          MiniMax
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          MiniMax 系列模型 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          MiniMax 系列模型，在创意写作和多轮对话方面表现突出。本文示例默认使用 OpenAI Chat Completions；同一模型 ID 也可按模型支持情况通过 Anthropic Messages 或 Gemini-compatible 协议调用。
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
          <DocsCodeBlock code={codeLang === "curl" ? curlExample : pythonExample} />
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
