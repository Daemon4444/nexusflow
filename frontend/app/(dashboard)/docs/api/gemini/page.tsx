"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const curlExamples = {
  basic: `curl "${API_BASE}/v1beta/models/qwen-turbo:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "解释什么是机器学习"}]}
    ]
  }'`,
  stream: `curl "${API_BASE}/v1beta/models/qwen-turbo:streamGenerateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "写一首关于秋天的诗"}]}
    ],
    "generationConfig": {
      "temperature": 0.9,
      "maxOutputTokens": 1024
    }
  }'`,
};

const pythonExamples = {
  basic: `import requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}/v1beta"

response = requests.post(
    f"{BASE}/models/qwen-turbo:generateContent",
    params={"key": API_KEY},
    headers={
        "Content-Type": "application/json",
    },
    json={
        "contents": [
            {"role": "user", "parts": [{"text": "解释什么是机器学习"}]}
        ]
    },
).json()

text = response["candidates"][0]["content"]["parts"][0]["text"]
print(text)`,
  stream: `import requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}/v1beta"

response = requests.post(
    f"{BASE}/models/qwen-turbo:streamGenerateContent",
    params={"key": API_KEY},
    headers={
        "Content-Type": "application/json",
    },
    json={
        "contents": [
            {"role": "user", "parts": [{"text": "写一首关于秋天的诗"}]}
        ],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 1024,
        },
    },
    stream=True,
)

for line in response.iter_lines():
    if line:
        print(line.decode())`,
};

type TabKey = "basic" | "stream";

export default function GeminiApiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#ecfdf5", color: "#047857", fontSize: 11, fontWeight: 700, marginBottom: 12,
        }}>
          Gemini 兼容层
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Gemini 协议兼容 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          提供 Google Gemini GenerateContent 请求/响应格式的兼容入口，适合已有 Gemini SDK 或 HTTP 调用迁移到 NexusFlow。
          这里不是 Google 原生 Gemini 模型托管，路径里的 <code>model</code> 必须填写 NexusFlow 模型 ID，例如 <code>qwen-turbo</code>。
        </p>
      </div>

      {/* Endpoints */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>接口地址</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { method: "POST", path: "/v1beta/models/{model}:generateContent", desc: "同步生成" },
            { method: "POST", path: "/v1beta/models/{model}:streamGenerateContent", desc: "流式生成" },
          ].map((ep) => (
            <div key={ep.path} style={{
              padding: "12px 18px", background: "var(--bg-elevated)", borderRadius: 8,
              border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>{ep.method}</span>
              <code style={{ fontSize: 13, flex: 1 }}>{API_BASE}{ep.path}</code>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必选</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["model", true, "路径参数，必须使用 NexusFlow 模型 ID，例如 qwen-turbo；不要填写 Google 原生模型名"],
                ["key", true, "API Key，推荐放在 query string：?key=sk-air-...；也兼容 Authorization: Bearer"],
                ["contents", true, "对话内容数组，每项包含 role（user/model）和 parts（text 数组）"],
                ["generationConfig.temperature", false, "采样温度 [0, 2]，默认 1.0"],
                ["generationConfig.maxOutputTokens", false, "最大输出 token 数"],
                ["generationConfig.topP", false, "Top-P 采样"],
                ["generationConfig.topK", false, "Top-K 采样"],
                ["generationConfig.stopSequences", false, "停止序列数组"],
                ["tools", false, "工具/函数定义数组（Function Calling）"],
              ].map(([name, required, desc], i) => (
                <tr key={name as string} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{name as string}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {required ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span> : "-"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc as string}</td>
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
          {([["basic", "同步调用"], ["stream", "流式调用"]] as const).map(([key, label]) => (
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

      {/* Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>响应格式</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "candidates": [{
    "content": {
      "parts": [{"text": "机器学习是人工智能的一个分支..."}],
      "role": "model"
    },
    "finishReason": "STOP"
  }],
  "usageMetadata": {
    "promptTokenCount": 12,
    "candidatesTokenCount": 256,
    "totalTokenCount": 268
  }
}`} />
        </div>
      </section>

      {/* Notes */}
      <section style={{ marginBottom: 36 }}>
        <div style={{
          padding: 16, background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af",
        }}>
          <strong>说明：</strong>Gemini 兼容层会将请求自动转换为平台内部格式，路由到对应模型后再将响应转回 Gemini 格式。
          这不是 Google 官方 Gemini 后端，也不保证 Google 原生模型名可用；模型能力以 NexusFlow 模型列表为准。
          如无 Gemini SDK 依赖，建议直接使用 <code>/v1/chat/completions</code>（OpenAI 格式）以获得更完整的功能支持。
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "OpenAI 格式对话接口" },
          { href: "/docs/multi-protocol", label: "多协议支持", desc: "查看所有兼容协议" },
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
