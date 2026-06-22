"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.vip";

const curlExamples = {
  basic: `curl "${API_BASE}/v1beta/models/qwen-turbo:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "Explain what machine learning is"}]}
    ]
  }'`,
  stream: `curl "${API_BASE}/v1beta/models/qwen-turbo:streamGenerateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "Write a poem about autumn"}]}
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
            {"role": "user", "parts": [{"text": "Explain what machine learning is"}]}
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
            {"role": "user", "parts": [{"text": "Write a poem about autumn"}]}
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
          Gemini Compatible Layer
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Gemini-Compatible API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Provides a compatible endpoint for the Google Gemini GenerateContent request/response format, suitable for users who already have a Gemini SDK or HTTP integration and want to migrate to NexusFlow. This is not Google's native Gemini model hosting; the <code>model</code> in the path must be a NexusFlow model ID, e.g. <code>qwen-turbo</code>.
        </p>
      </div>

      {/* Endpoints */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Endpoints</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { method: "POST", path: "/v1beta/models/{model}:generateContent", desc: "Synchronous generation" },
            { method: "POST", path: "/v1beta/models/{model}:streamGenerateContent", desc: "Streaming generation" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Request Parameters</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Parameters</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>Required</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["model", true, "Path parameter; must use a NexusFlow model ID, e.g. qwen-turbo; do not use Google's native model name"],
                ["key", true, "API Key; recommended to pass in the query string: ?key=sk-air-...; also compatible with Authorization: Bearer"],
                ["contents", true, "Conversation content array; each item includes role (user/model) and parts (text array)"],
                ["generationConfig.temperature", false, "Sampling temperature [0, 2], default 1.0"],
                ["generationConfig.maxOutputTokens", false, "Maximum output token count"],
                ["generationConfig.topP", false, "Top-P sampling"],
                ["generationConfig.topK", false, "Top-K sampling"],
                ["generationConfig.stopSequences", false, "Stop sequence array"],
                ["tools", false, "Tool/function definition array (Function Calling)"],
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Request Examples</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {([["basic", "Synchronous"], ["stream", "Streaming"]] as const).map(([key, label]) => (
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Response Format</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "candidates": [{
    "content": {
      "parts": [{"text": "Machine learning is a branch of artificial intelligence..."}],
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
          <strong>Note:</strong> The Gemini Compatible Layer automatically transforms requests into the platform's internal format, routes them to the corresponding model, and then converts the response back to Gemini format. This is not Google's official Gemini backend, and we do not guarantee that Google's native model names will work; model capabilities are based on the NexusFlow model list. If you don't have a Gemini SDK dependency, we recommend using <code>/v1/chat/completions</code> (OpenAI format) for more complete feature support.
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "OpenAI-format conversation interface" },
          { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "View all compatible protocols" },
          { href: "/pricing", label: "Full Pricing", desc: "View pricing for all models" },
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
