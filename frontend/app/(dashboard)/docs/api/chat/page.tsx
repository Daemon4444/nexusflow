"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

/* ── Tab types ── */
type ScenarioKey = "basic" | "stream" | "multiTurn" | "tools" | "vision";
type LangKey = "curl" | "python" | "nodejs";

const scenarioTabs: { key: ScenarioKey; label: string }[] = [
  { key: "basic", label: "基础对话" },
  { key: "stream", label: "流式输出" },
  { key: "multiTurn", label: "多轮对话" },
  { key: "tools", label: "工具调用" },
  { key: "vision", label: "视觉理解" },
];

const langTabs: { key: LangKey; label: string }[] = [
  { key: "curl", label: "cURL" },
  { key: "python", label: "Python" },
  { key: "nodejs", label: "Node.js" },
];

/* ── Request headers ── */
const requestHeaders = [
  { name: "Authorization", value: "Bearer <API_KEY>", required: true, desc: "API 密钥。在控制台创建后以 sk-air- 开头。" },
  { name: "Content-Type", value: "application/json", required: true, desc: "请求体格式，固定为 JSON。" },
];

/* ── Request parameters ── */
const requestParams: { name: string; type: string; required: boolean; default?: string; desc: string; link?: string }[] = [
  { name: "model", type: "string", required: true, desc: "模型 ID。例如 qwen3.5-plus、deepseek-v4-flash 等。", link: "/docs/models" },
  { name: "messages", type: "array", required: true, desc: "对话消息数组。每条消息包含 role（system / user / assistant / tool）和 content 字段。content 可以是字符串或内容数组；多模态内容是否可用取决于模型能力。" },
  { name: "stream", type: "boolean", required: false, default: "false", desc: "是否启用流式输出。启用后以 SSE（Server-Sent Events）格式逐 token 返回。" },
  { name: "temperature", type: "number", required: false, default: "1.0", desc: "采样温度，范围 [0, 2)。值越高输出越随机，值越低越确定。建议与 top_p 二选一调节。" },
  { name: "top_p", type: "number", required: false, default: "1.0", desc: "核采样概率阈值，范围 (0, 1]。模型仅从累计概率达到 top_p 的 token 集合中采样。" },
  { name: "max_tokens", type: "integer", required: false, desc: "生成的最大 token 数。不同模型有不同上限，未设置时使用模型默认值。" },
  { name: "tools", type: "array", required: false, desc: "可用工具/函数定义列表，用于 Function Calling。每个工具包含 type 和 function 字段。" },
  { name: "tool_choice", type: "string | object", required: false, default: '"auto"', desc: '工具调用策略。稳定支持 "auto"、"none"，或 {"type":"function","function":{"name":"..."}} 指定函数。思考模式模型不建议强制指定工具。' },
  { name: "stop", type: "string | string[]", required: false, desc: "停止词或停止词数组（最多 4 个）。模型生成到停止词时立即结束输出。" },
  { name: "frequency_penalty", type: "number", required: false, default: "0", desc: "频率惩罚，范围 [-2.0, 2.0]。正值根据 token 在已生成文本中出现的频率进行惩罚，降低重复。" },
  { name: "presence_penalty", type: "number", required: false, default: "0", desc: "存在惩罚，范围 [-2.0, 2.0]。正值根据 token 是否已出现过进行惩罚，提升话题多样性。" },
  { name: "enable_thinking", type: "boolean", required: false, desc: "是否开启思考模式。仅混合思考模型支持 true/false 开关；仅思考模型即使传 false 也会继续思考。" },
  { name: "stream_options", type: "object", required: false, desc: '流式请求附加选项。设置 {"include_usage": true} 可在最后一个 SSE chunk 中返回 token 用量。' },
  { name: "response_format", type: "object", required: false, desc: '响应格式控制。支持 {"type":"text"}（默认）和 {"type":"json_object"}（JSON 模式）。' },
];

/* ── Response fields ── */
const responseFields: { name: string; type: string; desc: string }[] = [
  { name: "id", type: "string", desc: "本次请求的唯一标识符，如 chatcmpl-abc123xyz789。" },
  { name: "object", type: "string", desc: '固定为 "chat.completion"。' },
  { name: "created", type: "integer", desc: "创建时间，Unix 时间戳（秒）。" },
  { name: "model", type: "string", desc: "实际使用的模型名称。" },
  { name: "choices", type: "array", desc: "生成结果数组（通常包含 1 个元素）。" },
  { name: "choices[].index", type: "integer", desc: "结果在数组中的索引位置。" },
  { name: "choices[].message.role", type: "string", desc: '消息角色，固定为 "assistant"。' },
  { name: "choices[].message.content", type: "string | null", desc: "生成的文本内容。当模型调用工具时可能为 null。" },
  { name: "choices[].message.reasoning_content", type: "string", desc: "推理模型（如 QwQ）返回的思维链内容。非推理模型不返回此字段。" },
  { name: "choices[].message.tool_calls", type: "array", desc: "工具调用请求数组。仅在模型决定调用工具时返回。" },
  { name: "choices[].finish_reason", type: "string", desc: '停止原因：stop（自然结束）、length（达到 max_tokens）、tool_calls（调用工具）。' },
  { name: "usage.prompt_tokens", type: "integer", desc: "输入消耗的 token 数。" },
  { name: "usage.completion_tokens", type: "integer", desc: "输出消耗的 token 数。" },
  { name: "usage.total_tokens", type: "integer", desc: "总 token 消耗（prompt_tokens + completion_tokens）。" },
];

/* ── Stream chunk fields ── */
const streamFields: { name: string; type: string; desc: string }[] = [
  { name: "id", type: "string", desc: "与完整响应相同的请求 ID。" },
  { name: "object", type: "string", desc: '固定为 "chat.completion.chunk"。' },
  { name: "choices[].delta.role", type: "string", desc: '仅在首个 chunk 中出现，值为 "assistant"。' },
  { name: "choices[].delta.content", type: "string", desc: "本次 chunk 的增量文本内容。" },
  { name: "choices[].delta.reasoning_content", type: "string", desc: "本次 chunk 的增量思维链内容（推理模型）。" },
  { name: "choices[].delta.tool_calls", type: "array", desc: "工具调用的增量数据（流式 Function Calling）。" },
  { name: "choices[].finish_reason", type: "string | null", desc: "仅在最后一个 chunk 中非 null，表示停止原因。" },
  { name: "usage", type: "object", desc: '仅当 stream_options.include_usage 为 true 时，在最终 chunk 中返回 token 用量。' },
];

/* ── Code examples ── */
const codeExamples: Record<ScenarioKey, Record<LangKey, string>> = {
  basic: {
    curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手。"},
      {"role": "user", "content": "什么是机器学习？"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "什么是机器学习？"}
    ],
    temperature=0.7,
    max_tokens=1000
)

print(response.choices[0].message.content)`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [
    { role: "system", content: "你是一个有帮助的助手。" },
    { role: "user", content: "什么是机器学习？" }
  ],
  temperature: 0.7,
  max_tokens: 1000,
});

console.log(response.choices[0].message.content);`,
  },
  stream: {
    curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "user", "content": "写一首关于春天的诗"}
    ],
    "stream": true,
    "stream_options": {
      "include_usage": true
    }
  }'

# 流式返回格式：
# data: {"id":"...","choices":[{"delta":{"content":"春"},...}]}
# data: [DONE]`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

stream = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[{"role": "user", "content": "写一首关于春天的诗"}],
    stream=True,
    stream_options={"include_usage": True},
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const stream = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [{ role: "user", content: "写一首关于春天的诗" }],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}`,
  },
  multiTurn: {
    curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "system", "content": "你是一个编程助手。"},
      {"role": "user", "content": "Python 中如何读取 JSON 文件？"},
      {"role": "assistant", "content": "在 Python 中读取 JSON..."},
      {"role": "user", "content": "如何处理中文编码问题？"}
    ]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

conversation = [
    {"role": "system", "content": "你是一个编程助手。"},
    {"role": "user", "content": "Python 中如何读取 JSON 文件？"},
]

# 第一轮
response1 = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=conversation,
)
assistant_msg = response1.choices[0].message.content
conversation.append({"role": "assistant", "content": assistant_msg})

# 第二轮：追问
conversation.append({"role": "user", "content": "如何处理中文编码问题？"})
response2 = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=conversation,
)
print(response2.choices[0].message.content)`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const conversation = [
  { role: "system", content: "你是一个编程助手。" },
  { role: "user", content: "Python 中如何读取 JSON 文件？" },
];

const response1 = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: conversation,
});
conversation.push({
  role: "assistant",
  content: response1.choices[0].message.content,
});

conversation.push({ role: "user", content: "如何处理中文编码问题？" });
const response2 = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: conversation,
});
console.log(response2.choices[0].message.content);`,
  },
  tools: {
    curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "user", "content": "北京今天天气怎么样？"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["city"]
        }
      }
    }],
    "tool_choice": "auto"
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["city"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[{"role": "user", "content": "北京今天天气怎么样？"}],
    tools=tools,
    tool_choice="auto",
)

if response.choices[0].message.tool_calls:
    call = response.choices[0].message.tool_calls[0]
    print(f"调用函数: {call.function.name}")
    print(f"参数: {call.function.arguments}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [{ role: "user", content: "北京今天天气怎么样？" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] }
        },
        required: ["city"]
      }
    }
  }],
  tool_choice: "auto",
});

const toolCall = response.choices[0].message.tool_calls?.[0];
if (toolCall) {
  console.log("调用函数:", toolCall.function.name);
  console.log("参数:", toolCall.function.arguments);
}`,
  },
  vision: {
    curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "描述一下这张图片的内容"},
        {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
      ]
    }],
    "max_tokens": 500
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述一下这张图片的内容"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/image.jpg"
                    }
                }
            ]
        }
    ],
    max_tokens=500
)

print(response.choices[0].message.content)`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "描述一下这张图片的内容" },
      { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
    ]
  }],
  max_tokens: 500,
});

console.log(response.choices[0].message.content);`,
  },
};

/* ── Shared styles ── */
const sectionHeading: React.CSSProperties = { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 };
const subHeading: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 };
const tableWrapper: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
const codeBlock: React.CSSProperties = { background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" };
const codePre: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 };

export default function ChatCompletionsApiPage() {
  const [scenario, setScenario] = useState<ScenarioKey>("basic");
  const [lang, setLang] = useState<LangKey>("curl");

  const rowBg = (i: number) => (i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>

      {/* ───────── Header ───────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 5,
            background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.5px", fontFamily: "'JetBrains Mono', monospace",
          }}>
            POST
          </span>
          <code style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)" }}>
            /v1/chat/completions
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Chat Completions API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          创建对话补全响应。接口完全兼容 OpenAI Chat Completions 格式，可直接使用 OpenAI 官方 SDK（Python / Node.js）接入，只需修改 <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>base_url</code> 和 <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>api_key</code>。支持流式输出、多轮对话、Function Calling、视觉理解等能力。
        </p>
      </div>

      {/* ───────── Endpoint ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>请求端点</h2>
        <div style={{
          padding: "10px 16px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "#dbeafe", color: "#1d4ed8",
          }}>POST</span>
          <code style={{ fontSize: 13 }}>{API_BASE}/v1/chat/completions</code>
        </div>
      </section>

      {/* ───────── Request Headers ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>请求头</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Header</th>
                <th style={{ ...th, width: 220 }}>值</th>
                <th style={{ ...th, width: 50, textAlign: "center" }}>必选</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestHeaders.map((h, i) => (
                <tr key={h.name} style={{ background: rowBg(i) }}>
                  <td style={td}><code style={{ fontSize: 12 }}>{h.name}</code></td>
                  <td style={{ ...td, color: "var(--text-tertiary)", fontSize: 12 }}><code>{h.value}</code></td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span>
                  </td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{h.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Request Parameters ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>请求参数</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>参数</th>
                <th style={{ ...th, width: 100 }}>类型</th>
                <th style={{ ...th, width: 50, textAlign: "center" }}>必选</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, i) => (
                <tr key={p.name} style={{ background: rowBg(i) }}>
                  <td style={td}>
                    <code style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{p.name}</code>
                  </td>
                  <td style={{ ...td, color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {p.required
                      ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span>
                      : <span style={{ color: "var(--text-tertiary)" }}>-</span>}
                  </td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {p.desc}
                    {p.default && (
                      <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>
                        默认：<code style={{ fontSize: 12 }}>{p.default}</code>
                      </span>
                    )}
                    {p.link && (
                      <Link href={p.link} style={{ marginLeft: 6, color: "var(--accent)", fontSize: 12 }}>查看列表 →</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Code Examples ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>代码示例</h2>

        {/* Scenario tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {scenarioTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setScenario(t.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: scenario === t.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: scenario === t.key ? "var(--accent-bg)" : "var(--bg)",
                color: scenario === t.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Language tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {langTabs.map((l) => (
            <button
              key={l.key}
              onClick={() => setLang(l.key)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
                background: lang === l.key ? "var(--text-primary)" : "var(--bg)",
                color: lang === l.key ? "var(--bg)" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div style={{ ...codeBlock, maxHeight: 520 }}>
          <pre style={codePre}>
            {codeExamples[scenario][lang]}
          </pre>
        </div>
      </section>

      {/* ───────── Response Format ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>响应格式（非流式）</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          非流式请求返回完整的 JSON 对象，<code>object</code> 字段值为 <code>&quot;chat.completion&quot;</code>。
        </p>

        {/* JSON example */}
        <h3 style={subHeading}>响应示例</h3>
        <div style={{ ...codeBlock, marginBottom: 20 }}>
          <pre style={codePre}>
{`{
  "id": "chatcmpl-abc123xyz789",
  "object": "chat.completion",
  "created": 1709123456,
  "model": "qwen3.5-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "机器学习是人工智能的一个分支..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 256,
    "total_tokens": 284
  }
}`}
          </pre>
        </div>

        {/* Fields table */}
        <h3 style={subHeading}>响应字段</h3>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>字段</th>
                <th style={{ ...th, width: 100 }}>类型</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {responseFields.map((f, i) => (
                <tr key={f.name} style={{ background: rowBg(i) }}>
                  <td style={td}><code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{f.name}</code></td>
                  <td style={{ ...td, color: "var(--text-tertiary)", fontSize: 12 }}>{f.type}</td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Stream Response Format ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>流式响应格式（SSE）</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          当 <code>stream: true</code> 时，响应以 <strong>Server-Sent Events (SSE)</strong> 格式逐步返回。每条事件以 <code>data: </code> 开头，最后以 <code>data: [DONE]</code> 标记结束。每个 chunk 的 <code>object</code> 字段值为 <code>&quot;chat.completion.chunk&quot;</code>。
        </p>

        {/* SSE format example */}
        <h3 style={subHeading}>SSE 数据格式</h3>
        <div style={{ ...codeBlock, marginBottom: 20 }}>
          <pre style={codePre}>
{`data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"content":"机器"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"content":"学习"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":28,"completion_tokens":256,"total_tokens":284}}

data: [DONE]`}
          </pre>
        </div>

        {/* Stream chunk fields table */}
        <h3 style={subHeading}>Chunk 字段说明</h3>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>字段</th>
                <th style={{ ...th, width: 100 }}>类型</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {streamFields.map((f, i) => (
                <tr key={f.name} style={{ background: rowBg(i) }}>
                  <td style={td}><code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{f.name}</code></td>
                  <td style={{ ...td, color: "var(--text-tertiary)", fontSize: 12 }}>{f.type}</td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* SSE tip */}
        <div style={{
          marginTop: 16, padding: 14, background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#1e40af",
        }}>
          <strong>提示：</strong>使用 OpenAI SDK 时无需手动解析 SSE，SDK 会自动处理流式响应并提供迭代器接口。仅在使用 cURL 或原生 HTTP 客户端时需要自行解析 SSE 数据。
        </div>
      </section>

      {/* ───────── Notes ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>与百炼官方 Chat API 的关系</h2>
        <div style={{
          padding: 16, background: "#f8fafc", border: "1px solid var(--border)",
          borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)",
        }}>
          NexusFlow 的 <code>/v1/chat/completions</code> 参考阿里云百炼 OpenAI-compatible Chat API 设计，稳定透传本文请求参数。
          当前公开网关未承诺透传 <code>parallel_tool_calls</code>、<code>enable_search</code>、<code>search_options</code>、<code>seed</code> 等扩展字段。
          需要这些扩展能力时，请先按实际模型做联调验证。官方参考：
          {" "}<a href="https://help.aliyun.com/zh/model-studio/qwen-api-reference/" target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>千问 API 参考</a>。
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>注意事项</h2>
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>不同模型的 <code>max_tokens</code> 上限不同，请参考 <Link href="/docs/models" style={{ color: "#1d4ed8" }}>模型列表</Link> 了解各模型限制。</li>
            <li><code>temperature</code> 和 <code>top_p</code> 建议只调节其中一个，同时设置可能产生不可预期的结果。</li>
            <li>流式输出时，只有最后一个 chunk 的 <code>finish_reason</code> 为非 null 值，代表生成结束。</li>
            <li>图像理解功能建议使用 Qwen-VL 系列等多模态模型。<code>content</code> 需传入数组格式包含 <code>image_url</code> 类型。</li>
            <li>Function Calling 推荐使用 Qwen、DeepSeek、GLM 等支持工具调用的模型系列。</li>
            <li>思考模式（<code>enable_thinking</code>）必须按模型 ID 使用；支持矩阵见 <Link href="/docs/api/parameters" style={{ color: "#1d4ed8" }}>参数矩阵</Link>。</li>
            <li>文档未列出的百炼扩展字段不会保证透传；不要把未验证字段作为生产依赖。</li>
            <li>完整参数说明与模型兼容矩阵见 <Link href="/docs/api/parameters" style={{ color: "#1d4ed8" }}>参数矩阵</Link>。</li>
          </ul>
        </div>
      </section>

      {/* ───────── Related Links ───────── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/models", label: "模型列表", desc: "查看所有可用模型与能力" },
          { href: "/docs/api/errors", label: "错误码", desc: "错误码说明与排查指南" },
          { href: "/docs/api/limits", label: "限流说明", desc: "请求频率限制与配额" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{
            padding: 16, borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--bg-elevated)", textDecoration: "none",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
