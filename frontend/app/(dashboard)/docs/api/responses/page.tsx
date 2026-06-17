"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const curlBasic = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "你好！"
  }'`;

const curlStream = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  --no-buffer \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "请简单介绍一下人工智能。",
    "stream": true
  }'`;

const curlTools = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "帮我找一下阿里云官网，并提取首页的关键信息",
    "tools": [
      {"type": "web_search"},
      {"type": "code_interpreter"},
      {"type": "web_extractor"}
    ]
  }'`;

const curlMultiTurn = `# 第一轮
curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "qwen3.7-plus", "input": "我的名字是张三"}'

# 第二轮 — 使用 previous_response_id
curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "你还记得我的名字吗？",
    "previous_response_id": "<第一轮返回的 id>"
  }'`;

const curlFunctionCall = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": [{"role": "user", "content": "北京天气怎么样"}],
    "tools": [{
      "type": "function",
      "name": "get_weather",
      "description": "查询指定城市的天气",
      "parameters": {
        "type": "object",
        "properties": {
          "city": {"type": "string", "description": "城市名称"}
        },
        "required": ["city"]
      }
    }]
  }'`;

const pythonBasic = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.responses.create(
    model="qwen3.7-plus",
    input="你好！"
)
print(response.output_text)`;

const pythonStream = `stream = client.responses.create(
    model="qwen3.7-plus",
    input="请简单介绍一下人工智能。",
    stream=True,
)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
    elif event.type == "response.completed":
        print(f"\\n总Token数: {event.response.usage.total_tokens}")`;

const pythonTools = `response = client.responses.create(
    model="qwen3.7-plus",
    input="帮我找一下阿里云官网，并提取首页的关键信息",
    tools=[
        {"type": "web_search"},
        {"type": "code_interpreter"},
        {"type": "web_extractor"},
    ],
)
print(response.output_text)`;

const pythonMultiTurn = `# 第一轮
response1 = client.responses.create(
    model="qwen3.7-plus",
    input="我的名字是张三，请记住。"
)

# 第二轮 — 通过 previous_response_id 关联上下文（有效期7天）
response2 = client.responses.create(
    model="qwen3.7-plus",
    input="你还记得我的名字吗？",
    previous_response_id=response1.id,
)
print(response2.output_text)`;

const pythonFunctionCall = `import json

tools = [{
    "type": "function",
    "name": "get_weather",
    "description": "查询指定城市的天气",
    "parameters": {
        "type": "object",
        "properties": {"city": {"type": "string", "description": "城市名称"}},
        "required": ["city"],
    },
}]

response = client.responses.create(
    model="qwen3.7-plus",
    input=[{"role": "user", "content": "北京天气怎么样"}],
    tools=tools,
)

# 检查是否需要调用工具
for item in response.output:
    if item.type == "function_call":
        print(f"调用工具: {item.name}, 参数: {item.arguments}")`;

const nodejsBasic = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.responses.create({
  model: "qwen3.7-plus",
  input: "你好！",
});
console.log(response.output_text);`;

const nodejsStream = `const stream = await client.responses.create({
  model: "qwen3.7-plus",
  input: "请简单介绍一下人工智能。",
  stream: true,
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "response.completed") {
    console.log(\`\\n总Token数: \${event.response.usage.total_tokens}\`);
  }
}`;

const params = [
  { name: "model", type: "string", required: true, desc: "模型名称，如 qwen3.7-plus、qwen3.7-max 等" },
  { name: "input", type: "string | array", required: true, desc: "纯文本或消息数组（支持 role: user/assistant/system/developer）" },
  { name: "instructions", type: "string", required: false, desc: "系统指令，插入上下文起始位置" },
  { name: "previous_response_id", type: "string", required: false, desc: "上一轮响应 ID（有效期 7 天），用于多轮对话" },
  { name: "stream", type: "boolean", required: false, desc: "是否开启流式输出，默认 false" },
  { name: "store", type: "boolean", required: false, desc: "是否存储响应（默认 true），false 则不能用 previous_response_id 引用" },
  { name: "tools", type: "array", required: false, desc: "工具列表：web_search、web_extractor、code_interpreter、function 等" },
  { name: "tool_choice", type: "string | object", required: false, desc: "工具选择策略：auto / none / required" },
  { name: "temperature", type: "float", required: false, desc: "采样温度，取值 [0, 2)" },
  { name: "top_p", type: "float", required: false, desc: "核采样概率阈值，取值 (0, 1]" },
  { name: "enable_thinking", type: "boolean", required: false, desc: "是否开启思考模式" },
  { name: "reasoning", type: "object", required: false, desc: "思考强度控制，如 {effort: \"high\"}" },
];

const responseFields = [
  { name: "id", type: "string", desc: "响应唯一标识（UUID 格式），有效期 7 天，可用作 previous_response_id" },
  { name: "object", type: "string", desc: "固定为 \"response\"" },
  { name: "status", type: "string", desc: "completed / failed / in_progress / cancelled" },
  { name: "model", type: "string", desc: "实际使用的模型 ID" },
  { name: "output", type: "array", desc: "输出项数组：message / reasoning / function_call / web_search_call 等" },
  { name: "usage", type: "object", desc: "Token 消耗：input_tokens、output_tokens、total_tokens、input_tokens_details、output_tokens_details" },
];

const builtinTools = [
  { name: "web_search", desc: "联网搜索，获取最新互联网信息" },
  { name: "web_extractor", desc: "网页抓取，提取网页内容（需配合 web_search）" },
  { name: "code_interpreter", desc: "代码解释器，执行代码并返回结果" },
  { name: "web_search_image", desc: "文搜图，根据文本描述搜索图片" },
  { name: "image_search", desc: "图搜图，根据图片搜索相似图片" },
  { name: "file_search", desc: "知识库搜索，检索已上传的知识库" },
  { name: "function", desc: "自定义函数工具，模型决定调用时返回 function_call" },
];

type Scenario = "basic" | "stream" | "tools" | "multiTurn" | "functionCall";
type Lang = "curl" | "python" | "nodejs";

const scenarios: { key: Scenario; label: string }[] = [
  { key: "basic", label: "基本调用" },
  { key: "stream", label: "流式输出" },
  { key: "tools", label: "内置工具" },
  { key: "multiTurn", label: "多轮对话" },
  { key: "functionCall", label: "Function Call" },
];

const langTabs: { key: Lang; label: string }[] = [
  { key: "curl", label: "cURL" },
  { key: "python", label: "Python" },
  { key: "nodejs", label: "Node.js" },
];

const codeMap: Record<Scenario, Record<Lang, string>> = {
  basic: { curl: curlBasic, python: pythonBasic, nodejs: nodejsBasic },
  stream: { curl: curlStream, python: pythonStream, nodejs: nodejsStream },
  tools: { curl: curlTools, python: pythonTools, nodejs: nodejsBasic },
  multiTurn: { curl: curlMultiTurn, python: pythonMultiTurn, nodejs: nodejsBasic },
  functionCall: { curl: curlFunctionCall, python: pythonFunctionCall, nodejs: nodejsStream },
};

/* ── Shared styles (matching chat/page.tsx) ── */
const sectionHeading: React.CSSProperties = { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 };
const tableWrapper: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
const codeBlock: React.CSSProperties = { background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" };

export default function ResponsesApiPage() {
  const [scenario, setScenario] = useState<Scenario>("basic");
  const [lang, setLang] = useState<Lang>("curl");

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
            /v1/responses
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Responses API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          兼容 OpenAI Responses API 格式。相较于 Chat Completions，提供内置工具（联网搜索、代码解释器等）、更灵活的输入格式和简化的多轮上下文管理。使用 OpenAI SDK 的 <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>client.responses.create()</code> 即可调用。
        </p>
      </div>

      {/* ───────── Protocol Limit ───────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{
          padding: "14px 18px", borderRadius: 10,
          background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)",
          border: "1px solid #fcd34d",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8, letterSpacing: "0.3px" }}>
            ⚠ 协议限制
          </div>
          <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7 }}>
            Responses API <strong>仅支持通义千问系列</strong>。调用 GLM、DeepSeek、Kimi、MiniMax 等模型会返回 <code style={{ fontSize: 11 }}>Unsupported model</code> 错误，请改用 <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/chat/completions</code> 或 <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/messages</code>。
          </div>
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: "1px dashed #fcd34d",
            fontSize: 13, color: "#92400e", lineHeight: 1.7,
          }}>
            当前支持的通义千问系列模型：<code style={{ fontSize: 11 }}>qwen3.7-max</code>、<code style={{ fontSize: 11 }}>qwen3.7-plus</code>、<code style={{ fontSize: 11 }}>qwen3.6-plus</code>、<code style={{ fontSize: 11 }}>qwen3.5-plus</code>、<code style={{ fontSize: 11 }}>qwen3.5-flash</code>、<code style={{ fontSize: 11 }}>qwen3.6-flash</code>、<code style={{ fontSize: 11 }}>qwen-plus</code>、<code style={{ fontSize: 11 }}>qwen-flash</code>、<code style={{ fontSize: 11 }}>qwen3-coder-plus</code>、<code style={{ fontSize: 11 }}>qwen3-coder-flash</code> 等。
          </div>
        </div>
      </section>

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
          <code style={{ fontSize: 13 }}>{API_BASE}/v1/responses</code>
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
              {params.map((p, i) => (
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
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{p.desc}</td>
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
          {scenarios.map((s) => (
            <button
              key={s.key}
              onClick={() => setScenario(s.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: scenario === s.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: scenario === s.key ? "var(--accent-bg)" : "var(--bg)",
                color: scenario === s.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {s.label}
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
          <DocsCodeBlock code={codeMap[scenario][lang]} />
        </div>
      </section>

      {/* ───────── Built-in Tools ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>内置工具</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          建议同时开启 web_search、web_extractor 和 code_interpreter 以获得最佳效果。
        </p>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>工具类型</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {builtinTools.map((t, i) => (
                <tr key={t.name} style={{ background: rowBg(i) }}>
                  <td style={td}><code style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{t.name}</code></td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Response Format ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>响应格式</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          非流式请求返回完整的 JSON 对象，<code>object</code> 字段值为 <code>&quot;response&quot;</code>。流式请求返回 SSE 事件流，以 <code>response.completed</code> 事件结束。
        </p>
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
                  <td style={td}><code style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{f.name}</code></td>
                  <td style={{ ...td, color: "var(--text-tertiary)", fontSize: 12 }}>{f.type}</td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Auxiliary Endpoints ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>辅助端点</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ ...th, width: 70 }}>方法</th>
                <th style={th}>端点</th>
                <th style={th}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                { method: "GET", path: "/v1/responses/{id}", desc: "检索已存储的响应（需 store=true）" },
                { method: "DELETE", path: "/v1/responses/{id}", desc: "删除已存储的响应" },
                { method: "GET", path: "/v1/responses/{id}/input_items", desc: "获取生成响应时使用的输入项列表" },
              ].map((row, i) => (
                <tr key={row.path + row.method} style={{ background: rowBg(i) }}>
                  <td style={td}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: row.method === "GET" ? "#dcfce7" : "#fee2e2", color: row.method === "GET" ? "#166534" : "#991b1b" }}>{row.method}</span>
                  </td>
                  <td style={td}><code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{row.path}</code></td>
                  <td style={{ ...td, color: "var(--text-secondary)", lineHeight: 1.6 }}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────── Supported Models ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>支持的模型</h2>
        <div style={{ padding: "14px 18px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>协议限制</div>
          <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7, margin: 0 }}>
            Responses API <strong>仅支持通义千问系列</strong>。
            调用 GLM、DeepSeek、Kimi、MiniMax 等模型会返回 <code style={{ fontSize: 12 }}>Unsupported model</code> 错误。请改用 <Link href="/docs/api/chat" style={{ color: "#92400e", textDecoration: "underline" }}>/v1/chat/completions</Link> 或 <Link href="/docs/api/anthropic" style={{ color: "#92400e", textDecoration: "underline" }}>/v1/messages</Link>。
          </p>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          当前 Responses API 支持通义千问系列模型：qwen3.7-max、qwen3.7-plus、qwen3.6-plus、qwen3.5-plus、qwen3.5-flash、qwen3.6-flash、qwen-plus、qwen-flash、qwen3-coder-plus、qwen3-coder-flash 等。
        </p>
      </section>

      {/* ───────── Notes ───────── */}
      <section style={{ marginBottom: 36, padding: "14px 18px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>注意事项</div>
        <ul style={{ fontSize: 13, color: "#92400e", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li><code style={{ fontSize: 12 }}>previous_response_id</code> 关联的响应有效期为 7 天。</li>
          <li>建议同时开启内置工具（web_search + web_extractor + code_interpreter）以获得最佳效果。</li>
          <li>设置 <code style={{ fontSize: 12 }}>store: false</code> 时响应不会被存储，无法被后续引用。</li>
          <li>流式输出的最终 <code style={{ fontSize: 12 }}>response.completed</code> 事件包含完整的 usage 信息。</li>
        </ul>
      </section>

      {/* ───────── Related ───────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "OpenAI 对话补全接口" },
          { href: "/docs/api/parameters", label: "参数详解", desc: "所有模型参数详细说明" },
          { href: "/docs/context-cache", label: "上下文缓存", desc: "降低多轮对话成本" },
        ].map((link) => (
          <Link key={link.href} href={link.href} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
