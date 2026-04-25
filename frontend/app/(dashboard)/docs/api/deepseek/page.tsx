"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://nexusflow.hk";

type TabKey = "chat" | "reasoning";

const tabs: { key: TabKey; label: string }[] = [
  { key: "chat", label: "对话补全" },
  { key: "reasoning", label: "推理模型" },
];

const modelsByTab: Record<TabKey, { id: string; name: string; ctx: string; input: string; output: string; tags: string[] }[]> = {
  chat: [
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", ctx: "131K", input: "¥1/M", output: "¥4/M", tags: ["V4", "极速", "高并发"] },
    { id: "deepseek-v3.2", name: "DeepSeek V3.2", ctx: "131K", input: "¥1/M", output: "¥4/M", tags: ["最新", "MoE", "编程"] },
    { id: "deepseek-v3", name: "DeepSeek V3", ctx: "65K", input: "¥0.5/M", output: "¥2/M", tags: ["MoE", "通用"] },
  ],
  reasoning: [
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", ctx: "131K", input: "¥4/M", output: "¥16/M", tags: ["V4", "旗舰", "复杂推理"] },
    { id: "deepseek-r1", name: "DeepSeek R1", ctx: "65K", input: "¥2/M", output: "¥8/M", tags: ["推理", "思考链"] },
  ],
};

const curlExample = (modelId: string) => `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {"role": "user", "content": "请推导欧拉公式 e^(iπ) + 1 = 0"}
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
        {"role": "user", "content": "请推导欧拉公式 e^(iπ) + 1 = 0"}
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
        {"role": "user", "content": "分析递归和动态规划的区别"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`;

function DeepSeekDocsInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs: TabKey[] = ["chat", "reasoning"];
  const initialTab = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : "chat";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "stream">("curl");

  useEffect(() => {
    if (validTabs.includes(tabParam as TabKey)) setActiveTab(tabParam as TabKey);
  }, [tabParam]);

  const currentModels = modelsByTab[activeTab];
  const [selectedModel, setSelectedModel] = useState(currentModels[0].id);

  useEffect(() => { setSelectedModel(modelsByTab[activeTab][0].id); }, [activeTab]);

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 5, background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 600 }}>
          DeepSeek / 深度求索
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>DeepSeek API</h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        通过 OpenAI 兼容接口调用 DeepSeek 系列模型，涵盖通用对话和推理能力。
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            border: activeTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
            background: activeTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
            color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
          }}>{tab.label}</button>
        ))}
      </div>

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
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 1024,
    "total_tokens": 1052
  }
}`}
          </pre>
        </div>
      </section>
    </div>
  );
}

export default function DeepSeekDocsPage() {
  return <Suspense fallback={null}><DeepSeekDocsInner /></Suspense>;
}
