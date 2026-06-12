"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

/* ── Tab types ── */
type ScenarioKey = "basic" | "stream" | "multiTurn" | "tools" | "vision";
type LangKey = "curl" | "python" | "nodejs";

const scenarioTabs: { key: ScenarioKey; label: string }[] = [
  { key: "basic", label: "Basic Chat" },
  { key: "stream", label: "Streaming" },
  { key: "multiTurn", label: "Multi-turn" },
  { key: "tools", label: "Tool Calling" },
  { key: "vision", label: "Vision" },
];

const langTabs: { key: LangKey; label: string }[] = [
  { key: "curl", label: "cURL" },
  { key: "python", label: "Python" },
  { key: "nodejs", label: "Node.js" },
];

/* ── Request headers ── */
const requestHeaders = [
  { name: "Authorization", value: "Bearer <API_KEY>", required: true, desc: "API key. Created in the console; starts with sk-air-." },
  { name: "Content-Type", value: "application/json", required: true, desc: "Request body format. Always JSON." },
];

/* ── Request parameters ── */
const requestParams: { name: string; type: string; required: boolean; default?: string; desc: string; link?: string }[] = [
  { name: "model", type: "string", required: true, desc: "Model ID, e.g. qwen3.5-plus, deepseek-v4-flash, etc.", link: "/docs/models" },
  { name: "messages", type: "array", required: true, desc: "Conversation message array. Each message has a role (system / user / assistant / tool) and a content field. content can be a string or an array of content parts; multimodal content availability depends on model capability." },
  { name: "stream", type: "boolean", required: false, default: "false", desc: "Whether to enable streaming output. When enabled, responses are returned token-by-token as Server-Sent Events (SSE)." },
  { name: "temperature", type: "number", required: false, default: "1.0", desc: "Sampling temperature in [0, 2). Higher values produce more random output, lower values are more deterministic. Adjust either temperature or top_p, not both." },
  { name: "top_p", type: "number", required: false, default: "1.0", desc: "Nucleus sampling probability threshold in (0, 1]. The model samples only from the smallest set of tokens whose cumulative probability reaches top_p." },
  { name: "max_tokens", type: "integer", required: false, desc: "Maximum number of tokens to generate. Each model has its own upper bound; defaults to the model's setting if unspecified." },
  { name: "tools", type: "array", required: false, desc: "List of tool/function definitions for function calling. Each tool has type and function fields." },
  { name: "tool_choice", type: "string | object", required: false, default: '"auto"', desc: 'Tool calling strategy. Stably supports "auto", "none", or {"type":"function","function":{"name":"..."}} to specify a function. Forcing a tool call is not recommended for thinking-mode models.' },
  { name: "stop", type: "string | string[]", required: false, desc: "Stop word or array of stop words (up to 4). Generation ends as soon as a stop word is produced." },
  { name: "frequency_penalty", type: "number", required: false, default: "0", desc: "Frequency penalty in [-2.0, 2.0]. Positive values penalize tokens based on their frequency in the generated text so far, reducing repetition." },
  { name: "presence_penalty", type: "number", required: false, default: "0", desc: "Presence penalty in [-2.0, 2.0]. Positive values penalize tokens based on whether they have already appeared, increasing topic diversity." },
  { name: "enable_thinking", type: "boolean", required: false, desc: "Whether to enable thinking mode. Only mixed-thinking models support the true/false toggle; reasoning-only models continue thinking even if false is passed." },
  { name: "stream_options", type: "object", required: false, desc: 'Additional options for streaming requests. Set {"include_usage": true} to return token usage in the final SSE chunk.' },
  { name: "response_format", type: "object", required: false, desc: 'Response format control. Supports {"type":"text"} (default) and {"type":"json_object"} (JSON mode).' },
];

/* ── Response fields ── */
const responseFields: { name: string; type: string; desc: string }[] = [
  { name: "id", type: "string", desc: "Unique identifier for this request, e.g. chatcmpl-abc123xyz789." },
  { name: "object", type: "string", desc: 'Always "chat.completion".' },
  { name: "created", type: "integer", desc: "Creation time, Unix timestamp in seconds." },
  { name: "model", type: "string", desc: "Name of the model actually used." },
  { name: "choices", type: "array", desc: "Array of completion results (typically contains 1 element)." },
  { name: "choices[].index", type: "integer", desc: "Index position of the result in the array." },
  { name: "choices[].message.role", type: "string", desc: 'Message role, always "assistant".' },
  { name: "choices[].message.content", type: "string | null", desc: "Generated text content. May be null when the model invokes a tool." },
  { name: "choices[].message.reasoning_content", type: "string", desc: "Chain-of-thought content returned by reasoning models (e.g. QwQ). Not returned by non-reasoning models." },
  { name: "choices[].message.tool_calls", type: "array", desc: "Tool call requests array. Returned only when the model decides to invoke a tool." },
  { name: "choices[].finish_reason", type: "string", desc: 'Stop reason: stop (natural end), length (max_tokens reached), tool_calls (tool invoked).' },
  { name: "usage.prompt_tokens", type: "integer", desc: "Number of input tokens consumed." },
  { name: "usage.completion_tokens", type: "integer", desc: "Number of output tokens consumed." },
  { name: "usage.total_tokens", type: "integer", desc: "Total token consumption (prompt_tokens + completion_tokens)." },
];

/* ── Stream chunk fields ── */
const streamFields: { name: string; type: string; desc: string }[] = [
  { name: "id", type: "string", desc: "Same request ID as the full response." },
  { name: "object", type: "string", desc: 'Always "chat.completion.chunk".' },
  { name: "choices[].delta.role", type: "string", desc: 'Only appears in the first chunk; value is "assistant".' },
  { name: "choices[].delta.content", type: "string", desc: "Incremental text content for this chunk." },
  { name: "choices[].delta.reasoning_content", type: "string", desc: "Incremental chain-of-thought content for this chunk (reasoning models)." },
  { name: "choices[].delta.tool_calls", type: "array", desc: "Incremental tool call data (streaming function calling)." },
  { name: "choices[].finish_reason", type: "string | null", desc: "Non-null only in the last chunk, indicating the stop reason." },
  { name: "usage", type: "object", desc: 'Returned in the final chunk only when stream_options.include_usage is true, containing token usage.' },
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
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is machine learning?"}
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
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is machine learning?"}
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
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is machine learning?" }
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
      {"role": "user", "content": "Write a poem about spring"}
    ],
    "stream": true,
    "stream_options": {
      "include_usage": true
    }
  }'

# Streaming response format:
# data: {"id":"...","choices":[{"delta":{"content":"Spring"},...}]}
# data: [DONE]`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

stream = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[{"role": "user", "content": "Write a poem about spring"}],
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
  messages: [{ role: "user", content: "Write a poem about spring" }],
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
      {"role": "system", "content": "You are a programming assistant."},
      {"role": "user", "content": "How do I read a JSON file in Python?"},
      {"role": "assistant", "content": "To read JSON in Python..."},
      {"role": "user", "content": "How do I handle Unicode encoding issues?"}
    ]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

conversation = [
    {"role": "system", "content": "You are a programming assistant."},
    {"role": "user", "content": "How do I read a JSON file in Python?"},
]

# First turn
response1 = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=conversation,
)
assistant_msg = response1.choices[0].message.content
conversation.append({"role": "assistant", "content": assistant_msg})

# Second turn: follow-up
conversation.append({"role": "user", "content": "How do I handle Unicode encoding issues?"})
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
  { role: "system", content: "You are a programming assistant." },
  { role: "user", content: "How do I read a JSON file in Python?" },
];

const response1 = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: conversation,
});
conversation.push({
  role: "assistant",
  content: response1.choices[0].message.content,
});

conversation.push({ role: "user", content: "How do I handle Unicode encoding issues?" });
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
      {"role": "user", "content": "What is the weather in Beijing today?"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather information for the specified city",
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
            "description": "Get weather information for the specified city",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "City name"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["city"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[{"role": "user", "content": "What is the weather in Beijing today?"}],
    tools=tools,
    tool_choice="auto",
)

if response.choices[0].message.tool_calls:
    call = response.choices[0].message.tool_calls[0]
    print(f"Function called: {call.function.name}")
    print(f"Arguments: {call.function.arguments}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [{ role: "user", content: "What is the weather in Beijing today?" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather information for the specified city",
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
  console.log("Function called:", toolCall.function.name);
  console.log("Arguments:", toolCall.function.arguments);
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
        {"type": "text", "text": "Describe what is in this image"},
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
                {"type": "text", "text": "Describe what is in this image"},
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
      { type: "text", text: "Describe what is in this image" },
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
          Create chat completion responses. The endpoint is fully compatible with the OpenAI Chat Completions format and works with the official OpenAI SDKs (Python / Node.js)—just change the <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>base_url</code> and <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>api_key</code>. Supports streaming, multi-turn dialog, function calling, vision understanding and more.
        </p>
      </div>

      {/* ───────── Endpoint ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Endpoint</h2>
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
        <h2 style={sectionHeading}>Request Headers</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Header</th>
                <th style={{ ...th, width: 220 }}>Value</th>
                <th style={{ ...th, width: 50, textAlign: "center" }}>Required</th>
                <th style={th}>Description</th>
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
        <h2 style={sectionHeading}>Request Parameters</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Parameter</th>
                <th style={{ ...th, width: 100 }}>Type</th>
                <th style={{ ...th, width: 50, textAlign: "center" }}>Required</th>
                <th style={th}>Description</th>
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
                        Default: <code style={{ fontSize: 12 }}>{p.default}</code>
                      </span>
                    )}
                    {p.link && (
                      <Link href={p.link} style={{ marginLeft: 6, color: "var(--accent)", fontSize: 12 }}>View list →</Link>
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
        <h2 style={sectionHeading}>Code Examples</h2>

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
          <DocsCodeBlock code={codeExamples[scenario][lang]} />
        </div>
      </section>

      {/* ───────── Response Format ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Response Format (non-streaming)</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          Non-streaming requests return a complete JSON object whose <code>object</code> field is <code>&quot;chat.completion&quot;</code>.
        </p>

        {/* JSON example */}
        <h3 style={subHeading}>Response Example</h3>
        <div style={{ ...codeBlock, marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "chatcmpl-abc123xyz789",
  "object": "chat.completion",
  "created": 1709123456,
  "model": "qwen3.5-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Machine learning is a branch of artificial intelligence..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 256,
    "total_tokens": 284
  }
}`} />
        </div>

        {/* Fields table */}
        <h3 style={subHeading}>Response Fields</h3>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Field</th>
                <th style={{ ...th, width: 100 }}>Type</th>
                <th style={th}>Description</th>
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
        <h2 style={sectionHeading}>Streaming Response Format (SSE)</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          When <code>stream: true</code>, the response is returned incrementally as <strong>Server-Sent Events (SSE)</strong>. Each event starts with <code>data: </code> and the stream ends with <code>data: [DONE]</code>. Each chunk's <code>object</code> field is <code>&quot;chat.completion.chunk&quot;</code>.
        </p>

        {/* SSE format example */}
        <h3 style={subHeading}>SSE Data Format</h3>
        <div style={{ ...codeBlock, marginBottom: 20 }}>
          <DocsCodeBlock code={`data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"content":"Machine"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{"content":" learning"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1709123456,"model":"qwen3.5-plus","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":28,"completion_tokens":256,"total_tokens":284}}

data: [DONE]`} />
        </div>

        {/* Stream chunk fields table */}
        <h3 style={subHeading}>Chunk Fields</h3>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Field</th>
                <th style={{ ...th, width: 100 }}>Type</th>
                <th style={th}>Description</th>
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
          <strong>Tip:</strong> When using the OpenAI SDK you don't need to parse SSE manually—the SDK handles streaming responses and exposes an iterator. Manual SSE parsing is only required when using cURL or a raw HTTP client.
        </div>
      </section>

      {/* ───────── Notes ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Relationship with the Bailian Chat API</h2>
        <div style={{
          padding: 16, background: "#f8fafc", border: "1px solid var(--border)",
          borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)",
        }}>
          NexusFlow's <code>/v1/chat/completions</code> is a fully transparent passthrough of the Alibaba Cloud Bailian OpenAI-compatible endpoint:
          the request body is forwarded as-is upstream and the response is returned as-is. Bailian extension fields such as <code>tools</code>, <code>tool_choice</code>, <code>response_format</code>,
          <code>enable_thinking</code>, <code>thinking_budget</code>, <code>enable_search</code>, <code>search_options</code>,
          <code>seed</code>, <code>top_k</code>, <code>logprobs</code>, <code>stream_options</code> and others can be used directly,
          subject to per-model support. Official reference:
          {" "}<a href="https://help.aliyun.com/zh/model-studio/qwen-api-reference/" target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>Qwen API Reference</a>.
        </div>
      </section>

      {/* ───────── Pricing Info ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Pricing</h2>

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Tiered Pricing</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 12 }}>
            Bailian-series models (Qwen, GLM, etc.) use <strong>tiered pricing based on the input token count of each request</strong>. The total prompt token count of a single request determines its pricing tier; input and output are billed at that tier's respective unit prices.
          </p>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
              <span>Example: qwen3-max</span><span>Input Token Range</span><span>Input Price ($/M)</span><span>Output Price ($/M)</span>
            </div>
            {[
              ["Tier 1", "0 ~ 32K", "2.5", "10"],
              ["Tier 2", "32K ~ 128K", "4", "16"],
              ["Tier 3", "128K ~ 256K", "7", "28"],
            ].map(([tier, range, inp, out], i) => (
              <div key={tier} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 14px", borderBottom: i < 2 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                <span style={{ fontWeight: 500 }}>{tier}</span><span>{range}</span><span style={{ color: "var(--success)" }}>{inp}</span><span style={{ color: "var(--success)" }}>{out}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            For example: a request with 50K input tokens + 2K output tokens is billed at $4/M for input and $16/M for output (Tier 2). See the full tier pricing on the <Link href="/pricing" style={{ color: "#1d4ed8" }}>Pricing page</Link>.
          </p>
        </div>

        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Prompt Caching</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 12 }}>
            Calls via <code>/v1/messages</code> (Anthropic protocol) support prompt caching. For repeated system prompts or long documents, DashScope automatically caches the prompt prefix, and subsequent requests benefit from a discount on cache hits:
          </p>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
              <span>Token Type</span><span>Billing Multiplier</span><span>Description</span>
            </div>
            {[
              ["cache_creation_input_tokens", "1.25x input price", "First write to cache, slightly above regular input"],
              ["cache_read_input_tokens", "0.1x input price", "Cache hit, 90% discount"],
              ["input_tokens (non-cache)", "1x input price", "Standard pricing"],
            ].map(([type, rate, desc], i) => (
              <div key={type} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", borderBottom: i < 2 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                <code style={{ fontSize: 11, wordBreak: "break-all" }}>{type}</code><span style={{ color: "var(--success)", fontWeight: 500 }}>{rate}</span><span style={{ color: "var(--text-tertiary)" }}>{desc}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, marginTop: 10 }}>
            <code>/v1/chat/completions</code> supports explicit caching via the <code>enable_context_caching: true</code> parameter (Bailian-series models). <code>/v1/messages</code> (Anthropic protocol) supports <code>cache_control</code> content-block annotations. Both protocols automatically benefit from implicit cache discounts.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Notes</h2>
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>The <code>max_tokens</code> upper bound varies by model. See the <Link href="/docs/models" style={{ color: "#1d4ed8" }}>Models list</Link> for per-model limits.</li>
            <li>It is recommended to tune only one of <code>temperature</code> and <code>top_p</code>; setting both can produce unexpected results.</li>
            <li>In streaming mode, only the last chunk has a non-null <code>finish_reason</code>, which marks the end of generation.</li>
            <li>For image understanding, use multimodal models such as the Qwen-VL series. <code>content</code> must be passed as an array containing an <code>image_url</code> entry.</li>
            <li>For function calling, use models that support tools, such as Qwen, DeepSeek and GLM.</li>
            <li>Thinking mode (<code>enable_thinking</code>) must be used per model ID. See the support matrix on the <Link href="/docs/api/parameters" style={{ color: "#1d4ed8" }}>Parameters Matrix</Link>.</li>
            <li>The request body is passed through to the upstream Bailian protocol; Bailian extension fields not documented here (such as <code>thinking_budget</code>, <code>enable_search</code>, <code>search_options</code>) can be used directly, subject to per-model support.</li>
            <li>See the <Link href="/docs/api/parameters" style={{ color: "#1d4ed8" }}>Parameters Matrix</Link> for full parameter descriptions and per-model compatibility.</li>
          </ul>
        </div>
      </section>

      {/* ───────── Related Links ───────── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/models", label: "Models", desc: "View all available models and capabilities" },
          { href: "/docs/api/errors", label: "Error Codes", desc: "Error code reference and troubleshooting" },
          { href: "/docs/api/limits", label: "Rate Limits", desc: "Request rate limits and quotas" },
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
