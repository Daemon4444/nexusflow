"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

export default function ChatCompletionsPage() {
  const [exampleTab, setExampleTab] = useState("basic");
  const [langTab, setLangTab] = useState("python");

  const codeExamples: Record<string, Record<string, string>> = {
    basic: {
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

  const requestParams = [
    { name: "model", type: "string", required: true, desc: "模型 ID。例如 qwen3.5-plus、deepseek-v4-flash 等。", link: "/docs/models" },
    { name: "messages", type: "array", required: true, desc: "对话消息数组。每条消息包含 role 和 content 字段。" },
    { name: "messages[].role", type: "string", required: true, desc: "消息角色：system / user / assistant / tool" },
    { name: "messages[].content", type: "string | array", required: true, desc: "消息内容。可以是字符串或内容数组（用于图像输入）" },
    { name: "messages[].content[].type", type: "string", required: false, desc: "多模态内容块类型：text / image_url。" },
    { name: "messages[].content[].image_url.url", type: "string", required: false, desc: "图片 URL 或 data URL，仅视觉模型使用。" },
    { name: "stream", type: "boolean", required: false, default: "false", desc: "是否启用流式输出。启用后以 SSE 格式逐字返回。" },
    { name: "stream_options.include_usage", type: "boolean", required: false, default: "false", desc: "流式请求是否在最后一个 SSE chunk 返回 usage。需要精确计费或统计时建议开启。" },
    { name: "temperature", type: "number", required: false, default: "1.0", desc: "采样温度，范围 [0, 2)。值越高越随机。" },
    { name: "top_p", type: "number", required: false, default: "1.0", desc: "核采样概率阈值，范围 (0, 1]。与 temperature 二选一。" },
    { name: "max_tokens", type: "integer", required: false, desc: "生成的最大 token 数。不同模型有不同上限。" },
    { name: "stop", type: "string | string[]", required: false, desc: "停止词或停止词数组。遇到时停止输出。" },
    { name: "enable_thinking", type: "boolean", required: false, desc: "是否开启思考模式。推理模型和支持思考的模型可用；非推理模型可不传。" },
    { name: "presence_penalty", type: "number", required: false, default: "0", desc: "存在惩罚，范围 [-2.0, 2.0]。" },
    { name: "frequency_penalty", type: "number", required: false, default: "0", desc: "频率惩罚，范围 [-2.0, 2.0]。" },
    { name: "tools", type: "array", required: false, desc: "可用工具/函数列表，用于 Function Calling。" },
    { name: "tool_choice", type: "string | object", required: false, default: '"auto"', desc: '工具调用策略："none" / "auto" / 指定函数。' },
    { name: "response_format", type: "object", required: false, desc: '响应格式。目前支持 {"type":"text"} 和 {"type":"json_object"}。' },
  ];

  const responseFields = [
    { name: "id", type: "string", desc: "本次请求的唯一标识符" },
    { name: "object", type: "string", desc: '固定为 "chat.completion"' },
    { name: "created", type: "integer", desc: "创建时间 Unix 时间戳" },
    { name: "model", type: "string", desc: "实际使用的模型名称" },
    { name: "choices", type: "array", desc: "生成结果数组" },
    { name: "choices[].index", type: "integer", desc: "结果索引" },
    { name: "choices[].message", type: "object", desc: "生成的消息对象" },
    { name: "choices[].message.role", type: "string", desc: '固定为 "assistant"' },
    { name: "choices[].message.content", type: "string | null", desc: "生成内容（调用工具时可能为 null）" },
    { name: "choices[].message.reasoning_content", type: "string", desc: "推理模型可能返回的思考内容" },
    { name: "choices[].message.tool_calls", type: "array", desc: "工具调用请求" },
    { name: "choices[].finish_reason", type: "string", desc: "停止原因：stop / length / tool_calls" },
    { name: "usage", type: "object", desc: "Token 使用统计" },
    { name: "usage.prompt_tokens", type: "integer", desc: "输入 token 数" },
    { name: "usage.completion_tokens", type: "integer", desc: "输出 token 数" },
    { name: "usage.total_tokens", type: "integer", desc: "总 token 数" },
  ];

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 4,
            background: "#dbeafe",
            color: "#1d4ed8",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            POST
          </span>
          <code style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)" }}>
            /v1/chat/completions
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          对话补全 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          创建对话补全响应。支持流式输出、多轮对话、Function Calling、视觉理解等功能。
        </p>
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          请求端点
        </h2>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: "14px 20px" }}>
          <code style={{ fontSize: 14, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>
            POST {API_BASE}/v1/chat/completions
          </code>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <code style={{ background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)" }}>
            Authorization: Bearer {"<API_KEY>"}
          </code>
          <code style={{ background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)" }}>
            Content-Type: application/json
          </code>
        </div>
      </section>

      {/* Request Parameters */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          请求参数
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ textAlign: "left", padding: "12px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>类型</th>
                <th style={{ textAlign: "center", padding: "12px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必填</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <code style={{ fontSize: 13, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "12px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12, verticalAlign: "top" }}>{p.type}</td>
                  <td style={{ padding: "12px 12px", borderBottom: "1px solid var(--border)", textAlign: "center", verticalAlign: "top" }}>
                    {p.required ? <span style={{ color: "var(--danger)", fontWeight: 600 }}>*</span> : <span style={{ color: "var(--text-tertiary)" }}>-</span>}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6, verticalAlign: "top", fontSize: 13 }}>
                    {p.desc}
                    {p.default && <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>默认：<code style={{ fontSize: 12 }}>{p.default}</code></span>}
                    {p.link && <Link href={p.link} style={{ marginLeft: 6, color: "var(--accent)", fontSize: 12 }}>查看列表 →</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code Examples */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          代码示例
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { id: "basic", label: "基础调用" },
            { id: "stream", label: "流式输出" },
            { id: "multiTurn", label: "多轮对话" },
            { id: "tools", label: "Function Calling" },
            { id: "vision", label: "图像理解" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setExampleTab(t.id)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: exampleTab === t.id ? "var(--text-primary)" : "var(--bg)",
                color: exampleTab === t.id ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["python", "curl", "nodejs"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLangTab(l)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                borderRadius: 4,
                background: langTab === l ? "#333" : "transparent",
                color: langTab === l ? "#fff" : "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              {l === "python" ? "Python" : l === "nodejs" ? "Node.js" : "cURL"}
            </button>
          ))}
        </div>

        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", maxHeight: 500 }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
            {codeExamples[exampleTab][langTab]}
          </pre>
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          响应结构
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ textAlign: "left", padding: "12px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>类型</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {responseFields.map((f, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{f.name}</code>
                  </td>
                  <td style={{ padding: "12px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{f.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Response JSON */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>响应示例</div>
          <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
            <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
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
        </div>
      </section>

      {/* Notes */}
      <section style={{ marginBottom: 40 }}>
        <div style={{
          padding: 20,
          background: "var(--warning-bg)",
          border: "1px solid var(--warning-border)",
          borderRadius: 10,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--warning)", marginBottom: 12 }}>
            注意事项
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#92400e", lineHeight: 2 }}>
            <li>不同模型 <code>max_tokens</code> 上限不同，参考 <Link href="/docs/models" style={{ color: "var(--accent)" }}>模型列表</Link></li>
            <li><code>temperature</code> 和 <code>top_p</code> 建议只使用其中一个</li>
            <li>流式输出时最后一个 chunk 的 <code>finish_reason</code> 才表示完成</li>
            <li>图像理解建议使用 Qwen-VL 系列和多模态模型</li>
            <li>Function Calling 推荐使用 Qwen、DeepSeek、GLM 系列</li>
            <li>完整参数和协议映射见 <Link href="/docs/api/parameters" style={{ color: "var(--accent)" }}>参数矩阵</Link></li>
          </ul>
        </div>
      </section>

      {/* Related */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/models", label: "模型列表", desc: "查看所有可用模型" },
            { href: "/docs/api/errors", label: "错误码", desc: "错误码和排查指南" },
            { href: "/docs/api/limits", label: "限流说明", desc: "请求频率限制" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
