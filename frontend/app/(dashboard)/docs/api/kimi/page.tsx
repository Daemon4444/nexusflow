"use client";

import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const models = [
  { id: "kimi-k2.5", name: "Kimi K2.5", ctx: "131K", input: "¥1/M", output: "¥4/M", tags: ["最新", "长文本", "多轮对话"] },
];

const curlExample = (modelId: string) => `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {"role": "system", "content": "你是Kimi，由月之暗面提供的AI助手。"},
      {"role": "user", "content": "帮我总结一下这篇长文的核心观点"}
    ],
    "temperature": 0.7,
    "max_tokens": 4000
  }'`;

const pythonExample = (modelId: string) => `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "system", "content": "你是Kimi，由月之暗面提供的AI助手。"},
        {"role": "user", "content": "帮我总结一下这篇长文的核心观点"}
    ],
    temperature=0.7,
    max_tokens=4000
)

print(response.choices[0].message.content)`;

const streamExample = (modelId: string) => `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

stream = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "user", "content": "写一个关于人工智能发展的详细报告"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`;

export default function KimiDocsPage() {
  const [selectedModel, setSelectedModel] = useState("kimi-k2.5");
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "stream">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 5, background: "#f0f9ff", color: "#0369a1", fontSize: 11, fontWeight: 600 }}>
          月之暗面 / Moonshot
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>月之暗面 (Kimi) 对话补全 API</h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        通过 OpenAI 兼容接口调用月之暗面 Kimi 系列模型，擅长长文本理解和多轮对话。
      </p>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>接口信息</h2>
        <div style={{ background: "var(--bg-elevated)", borderRadius: 8, padding: "14px 18px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{API_BASE}/v1/chat/completions</code>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>可用模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "var(--bg-elevated)" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入价格</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出价格</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>特点</th>
            </tr></thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{m.id}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.ctx}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.output}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 4 }}>{m.tags.map(t => <span key={t} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>{t}</span>)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "var(--bg-elevated)" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必选</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
            </tr></thead>
            <tbody>
              {[
                { name: "model", type: "string", req: true, desc: "模型 ID，如 kimi-k2.5" },
                { name: "messages", type: "array", req: true, desc: "消息列表，支持 system / user / assistant" },
                { name: "temperature", type: "float", req: false, desc: "采样温度，范围 0-2，默认 1" },
                { name: "max_tokens", type: "integer", req: false, desc: "最大输出 token 数" },
                { name: "stream", type: "boolean", req: false, desc: "是否流式输出，默认 false" },
                { name: "top_p", type: "float", req: false, desc: "核采样阈值，范围 0-1" },
              ].map((p, i) => (
                <tr key={p.name} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{p.name}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{p.type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{p.req ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span> : "-"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求示例</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {([["curl", "cURL"], ["python", "Python"], ["stream", "流式输出"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setCodeLang(key)} style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
              background: codeLang === key ? "var(--text-primary)" : "var(--bg)", color: codeLang === key ? "var(--bg)" : "var(--text-secondary)",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>
            {codeLang === "curl" ? curlExample(selectedModel) : codeLang === "python" ? pythonExample(selectedModel) : streamExample(selectedModel)}
          </pre>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>响应示例</h2>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>
{`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "${selectedModel}",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 35, "completion_tokens": 1024, "total_tokens": 1059 }
}`}
          </pre>
        </div>
      </section>
    </div>
  );
}
