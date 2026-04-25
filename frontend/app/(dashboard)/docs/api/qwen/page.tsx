"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://nexusflow.hk";

type TabKey = "chat" | "reasoning" | "multimodal" | "coding";

const tabs: { key: TabKey; label: string }[] = [
  { key: "chat", label: "对话补全" },
  { key: "reasoning", label: "推理模型" },
  { key: "multimodal", label: "多模态" },
  { key: "coding", label: "编程模型" },
];

const modelsByTab: Record<TabKey, { id: string; name: string; ctx: string; input: string; output: string; tags: string[] }[]> = {
  chat: [
    { id: "qwen3-max", name: "Qwen3 Max", ctx: "262K", input: "¥2.5/M", output: "¥10/M", tags: ["旗舰", "思考模式"] },
    { id: "qwen3.5-plus", name: "Qwen3.5 Plus", ctx: "1M", input: "¥0.8/M", output: "¥4.8/M", tags: ["百万上下文", "推荐"] },
    { id: "qwen3.5-flash", name: "Qwen3.5 Flash", ctx: "1M", input: "¥0.2/M", output: "¥2/M", tags: ["极速", "低成本"] },
    { id: "qwen-plus", name: "Qwen Plus", ctx: "131K", input: "¥0.8/M", output: "¥2/M", tags: ["高性价比"] },
    { id: "qwen-turbo", name: "Qwen Turbo", ctx: "131K", input: "¥0.3/M", output: "¥0.6/M", tags: ["快速"] },
    { id: "qwen-max", name: "Qwen Max", ctx: "32K", input: "¥2/M", output: "¥6/M", tags: ["旗舰"] },
    { id: "qwen-long", name: "Qwen Long", ctx: "10M", input: "¥0.5/M", output: "¥2/M", tags: ["超长上下文"] },
    { id: "qwen3-235b-a22b", name: "Qwen3 235B", ctx: "131K", input: "¥1/M", output: "¥4/M", tags: ["开源", "MoE"] },
    { id: "qwen3-32b", name: "Qwen3 32B", ctx: "131K", input: "¥0.5/M", output: "¥2/M", tags: ["开源"] },
  ],
  reasoning: [
    { id: "qwq-plus", name: "QwQ Plus", ctx: "131K", input: "¥1/M", output: "¥4/M", tags: ["推理", "思考链"] },
    { id: "qwen-math-plus", name: "Qwen Math Plus", ctx: "4K", input: "¥4/M", output: "¥12/M", tags: ["数学", "LaTeX"] },
  ],
  multimodal: [
    { id: "qwen-vl-max", name: "Qwen VL Max", ctx: "32K", input: "¥3/M", output: "¥9/M", tags: ["视觉旗舰", "OCR"] },
    { id: "qwen-vl-plus", name: "Qwen VL Plus", ctx: "32K", input: "¥1.5/M", output: "¥4.5/M", tags: ["视觉", "高性价比"] },
    { id: "qwen3-vl-plus", name: "Qwen3 VL Plus", ctx: "262K", input: "¥1/M", output: "¥10/M", tags: ["高分辨率"] },
    { id: "qwen3-vl-flash", name: "Qwen3 VL Flash", ctx: "131K", input: "免费", output: "免费", tags: ["免费", "极速"] },
    { id: "qwen3-omni-flash", name: "Qwen3 Omni Flash", ctx: "65K", input: "¥1.8/M", output: "¥6.9/M", tags: ["全能", "音视频"] },
  ],
  coding: [
    { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", ctx: "1M", input: "¥4/M", output: "¥16/M", tags: ["旗舰", "工具调用"] },
    { id: "qwen3-coder-flash", name: "Qwen3 Coder Flash", ctx: "131K", input: "免费", output: "免费", tags: ["免费", "极速"] },
  ],
};

const curlExample = (modelId: string) => `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手。"},
      {"role": "user", "content": "用Python实现快速排序"}
    ],
    "temperature": 0.7,
    "max_tokens": 2000
  }'`;

const pythonExample = (modelId: string) => `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "用Python实现快速排序"}
    ],
    temperature=0.7,
    max_tokens=2000
)

print(response.choices[0].message.content)`;

const visionExample = (modelId: string) => `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述这张图片的内容"},
                {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
            ]
        }
    ],
    max_tokens=1000
)

print(response.choices[0].message.content)`;

function QwenDocsInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs: TabKey[] = ["chat", "reasoning", "multimodal", "coding"];
  const initialTab = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : "chat";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "vision">("curl");

  useEffect(() => {
    if (validTabs.includes(tabParam as TabKey)) setActiveTab(tabParam as TabKey);
  }, [tabParam]);

  const currentModels = modelsByTab[activeTab];
  const [selectedModel, setSelectedModel] = useState(currentModels[0].id);

  useEffect(() => { setSelectedModel(modelsByTab[activeTab][0].id); }, [activeTab]);

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 5, background: "#ede9fe", color: "#6d28d9", fontSize: 11, fontWeight: 600 }}>
          通义千问 / Qwen
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>通义千问 API</h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        通过 OpenAI 兼容接口调用通义千问全系列模型，涵盖对话、推理、多模态、编程等能力。
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32, flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            border: activeTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
            background: activeTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
            color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>接口信息</h2>
        <div style={{ background: "var(--bg-elevated)", borderRadius: 8, padding: "14px 18px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{API_BASE}/v1/chat/completions</code>
          </div>
        </div>
      </section>

      {/* Models Table */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>可用模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输入价格</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>输出价格</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>特点</th>
              </tr>
            </thead>
            <tbody>
              {currentModels.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", cursor: "pointer" }} onClick={() => setSelectedModel(m.id)}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontWeight: selectedModel === m.id ? 700 : 400, color: selectedModel === m.id ? "var(--accent)" : "inherit" }}>{m.id}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.ctx}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.input}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.output}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {m.tags.map(t => <span key={t} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>{t}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>点击行可切换下方示例中的模型 ID</p>
      </section>

      {/* Code Examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求示例</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {([["curl", "cURL"], ["python", "Python"], ["vision", "视觉输入"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setCodeLang(key)} style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
              background: codeLang === key ? "var(--text-primary)" : "var(--bg)", color: codeLang === key ? "var(--bg)" : "var(--text-secondary)",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>
            {codeLang === "curl" ? curlExample(selectedModel) : codeLang === "python" ? pythonExample(selectedModel) : visionExample(activeTab === "multimodal" ? selectedModel : "qwen-vl-max")}
          </pre>
        </div>
      </section>

      {/* Response */}
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
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 35,
    "completion_tokens": 512,
    "total_tokens": 547
  }
}`}
          </pre>
        </div>
      </section>
    </div>
  );
}

export default function QwenDocsPage() {
  return <Suspense fallback={null}><QwenDocsInner /></Suspense>;
}
