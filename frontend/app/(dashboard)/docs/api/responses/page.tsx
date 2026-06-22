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
    "input": "Hello!"
  }'`;

const curlStream = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  --no-buffer \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "Give a brief introduction to artificial intelligence.",
    "stream": true
  }'`;

const curlTools = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "Find the Alibaba Cloud website and extract the key information from the homepage",
    "tools": [
      {"type": "web_search"},
      {"type": "code_interpreter"},
      {"type": "web_extractor"}
    ]
  }'`;

const curlMultiTurn = `# First turn
curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "qwen3.7-plus", "input": "My name is Zhang San"}'

# Second turn — using previous_response_id
curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "Do you still remember my name?",
    "previous_response_id": "<id returned from the first turn>"
  }'`;

const curlFunctionCall = `curl ${API_BASE}/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": [{"role": "user", "content": "What is the weather in Beijing"}],
    "tools": [{
      "type": "function",
      "name": "get_weather",
      "description": "Query the weather for a given city",
      "parameters": {
        "type": "object",
        "properties": {
          "city": {"type": "string", "description": "City name"}
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
    input="Hello!"
)
print(response.output_text)`;

const pythonStream = `stream = client.responses.create(
    model="qwen3.7-plus",
    input="Give a brief introduction to artificial intelligence.",
    stream=True,
)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
    elif event.type == "response.completed":
        print(f"\\nTotal tokens: {event.response.usage.total_tokens}")`;

const pythonTools = `response = client.responses.create(
    model="qwen3.7-plus",
    input="Find the Alibaba Cloud website and extract the key information from the homepage",
    tools=[
        {"type": "web_search"},
        {"type": "code_interpreter"},
        {"type": "web_extractor"},
    ],
)
print(response.output_text)`;

const pythonMultiTurn = `# First turn
response1 = client.responses.create(
    model="qwen3.7-plus",
    input="My name is Zhang San, please remember it."
)

# Second turn — link context via previous_response_id (valid for 7 days)
response2 = client.responses.create(
    model="qwen3.7-plus",
    input="Do you still remember my name?",
    previous_response_id=response1.id,
)
print(response2.output_text)`;

const pythonFunctionCall = `import json

tools = [{
    "type": "function",
    "name": "get_weather",
    "description": "Query the weather for a given city",
    "parameters": {
        "type": "object",
        "properties": {"city": {"type": "string", "description": "City name"}},
        "required": ["city"],
    },
}]

response = client.responses.create(
    model="qwen3.7-plus",
    input=[{"role": "user", "content": "What is the weather in Beijing"}],
    tools=tools,
)

# Check whether a tool call is needed
for item in response.output:
    if item.type == "function_call":
        print(f"Tool call: {item.name}, arguments: {item.arguments}")`;

const nodejsBasic = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.responses.create({
  model: "qwen3.7-plus",
  input: "Hello!",
});
console.log(response.output_text);`;

const nodejsStream = `const stream = await client.responses.create({
  model: "qwen3.7-plus",
  input: "Give a brief introduction to artificial intelligence.",
  stream: true,
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "response.completed") {
    console.log(\`\\nTotal tokens: \${event.response.usage.total_tokens}\`);
  }
}`;

const params = [
  { name: "model", type: "string", required: true, desc: "Model name, e.g. qwen3.7-plus, qwen3.7-max" },
  { name: "input", type: "string | array", required: true, desc: "Plain text or an array of messages (supports role: user/assistant/system/developer)" },
  { name: "instructions", type: "string", required: false, desc: "System instructions, inserted at the start of the context" },
  { name: "previous_response_id", type: "string", required: false, desc: "Previous response ID (valid for 7 days), used for multi-turn conversations" },
  { name: "stream", type: "boolean", required: false, desc: "Whether to enable streaming output, default false" },
  { name: "store", type: "boolean", required: false, desc: "Whether to store the response (default true); if false, it cannot be referenced via previous_response_id" },
  { name: "tools", type: "array", required: false, desc: "Tool list: web_search, web_extractor, code_interpreter, function, etc." },
  { name: "tool_choice", type: "string | object", required: false, desc: "Tool selection strategy: auto / none / required" },
  { name: "temperature", type: "float", required: false, desc: "Sampling temperature, range [0, 2)" },
  { name: "top_p", type: "float", required: false, desc: "Nucleus sampling probability threshold, range (0, 1]" },
  { name: "enable_thinking", type: "boolean", required: false, desc: "Whether to enable thinking mode" },
  { name: "reasoning", type: "object", required: false, desc: "Thinking effort control, e.g. {effort: \"high\"}" },
];

const responseFields = [
  { name: "id", type: "string", desc: "Unique response identifier (UUID format), valid for 7 days, usable as previous_response_id" },
  { name: "object", type: "string", desc: "Always \"response\"" },
  { name: "status", type: "string", desc: "completed / failed / in_progress / cancelled" },
  { name: "model", type: "string", desc: "The model ID actually used" },
  { name: "output", type: "array", desc: "Array of output items: message / reasoning / function_call / web_search_call, etc." },
  { name: "usage", type: "object", desc: "Token usage: input_tokens, output_tokens, total_tokens, input_tokens_details, output_tokens_details" },
];

const builtinTools = [
  { name: "web_search", desc: "Web search to fetch the latest internet information" },
  { name: "web_extractor", desc: "Web extraction to pull page content (use with web_search)" },
  { name: "code_interpreter", desc: "Code interpreter that runs code and returns results" },
  { name: "web_search_image", desc: "Text-to-image search, finds images from a text description" },
  { name: "image_search", desc: "Image-to-image search, finds similar images from an image" },
  { name: "file_search", desc: "Knowledge base search over uploaded knowledge bases" },
  { name: "function", desc: "Custom function tool; returns function_call when the model decides to call it" },
];

type Scenario = "basic" | "stream" | "tools" | "multiTurn" | "functionCall";
type Lang = "curl" | "python" | "nodejs";

const scenarios: { key: Scenario; label: string }[] = [
  { key: "basic", label: "Basic Usage" },
  { key: "stream", label: "Streaming" },
  { key: "tools", label: "Built-in Tools" },
  { key: "multiTurn", label: "Multi-turn" },
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
          Compatible with the OpenAI Responses API format. Compared with Chat Completions, it offers built-in tools (web search, code interpreter, etc.), a more flexible input format, and simplified multi-turn context management. Call it via the OpenAI SDK's <code style={{ fontSize: 13, background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>client.responses.create()</code>.
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
            ⚠ Protocol Restriction
          </div>
          <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7 }}>
            The Responses API <strong>only supports the Qwen series</strong>. Calling models like GLM, DeepSeek, Kimi, or MiniMax returns an <code style={{ fontSize: 11 }}>Unsupported model</code> error; use <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/chat/completions</code> or <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/messages</code> instead.
          </div>
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: "1px dashed #fcd34d",
            fontSize: 13, color: "#92400e", lineHeight: 1.7,
          }}>
            Currently supported Qwen series models: <code style={{ fontSize: 11 }}>qwen3.7-max</code>, <code style={{ fontSize: 11 }}>qwen3.7-plus</code>, <code style={{ fontSize: 11 }}>qwen3.6-plus</code>, <code style={{ fontSize: 11 }}>qwen3.5-plus</code>, <code style={{ fontSize: 11 }}>qwen3.5-flash</code>, <code style={{ fontSize: 11 }}>qwen3.6-flash</code>, <code style={{ fontSize: 11 }}>qwen-plus</code>, <code style={{ fontSize: 11 }}>qwen-flash</code>, <code style={{ fontSize: 11 }}>qwen3-coder-plus</code>, <code style={{ fontSize: 11 }}>qwen3-coder-flash</code>, and more.
          </div>
        </div>
      </section>

      {/* ───────── Endpoint ───────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={sectionHeading}>Request Endpoint</h2>
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
        <h2 style={sectionHeading}>Code Examples</h2>

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
        <h2 style={sectionHeading}>Built-in Tools</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          Enabling web_search, web_extractor, and code_interpreter together is recommended for best results.
        </p>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={th}>Tool Type</th>
                <th style={th}>Description</th>
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
        <h2 style={sectionHeading}>Response Format</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          Non-streaming requests return a complete JSON object whose <code>object</code> field is <code>&quot;response&quot;</code>. Streaming requests return an SSE event stream that ends with the <code>response.completed</code> event.
        </p>
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
        <h2 style={sectionHeading}>Auxiliary Endpoints</h2>
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ ...th, width: 70 }}>Method</th>
                <th style={th}>Endpoint</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { method: "GET", path: "/v1/responses/{id}", desc: "Retrieve a stored response (requires store=true)" },
                { method: "DELETE", path: "/v1/responses/{id}", desc: "Delete a stored response" },
                { method: "GET", path: "/v1/responses/{id}/input_items", desc: "Get the list of input items used to generate the response" },
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
        <h2 style={sectionHeading}>Supported Models</h2>
        <div style={{ padding: "14px 18px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>Protocol Restriction</div>
          <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7, margin: 0 }}>
            The Responses API <strong>only supports the Qwen series</strong>.
            Calling models like GLM, DeepSeek, Kimi, or MiniMax returns an <code style={{ fontSize: 12 }}>Unsupported model</code> error. Use <Link href="/docs/api/chat" style={{ color: "#92400e", textDecoration: "underline" }}>/v1/chat/completions</Link> or <Link href="/docs/api/anthropic" style={{ color: "#92400e", textDecoration: "underline" }}>/v1/messages</Link> instead.
          </p>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          The Responses API currently supports the Qwen series: qwen3.7-max, qwen3.7-plus, qwen3.6-plus, qwen3.5-plus, qwen3.5-flash, qwen3.6-flash, qwen-plus, qwen-flash, qwen3-coder-plus, qwen3-coder-flash, and more.
        </p>
      </section>

      {/* ───────── Notes ───────── */}
      <section style={{ marginBottom: 36, padding: "14px 18px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>Notes</div>
        <ul style={{ fontSize: 13, color: "#92400e", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>The response linked by <code style={{ fontSize: 12 }}>previous_response_id</code> is valid for 7 days.</li>
          <li>Enabling the built-in tools together (web_search + web_extractor + code_interpreter) is recommended for best results.</li>
          <li>When <code style={{ fontSize: 12 }}>store: false</code> is set, the response is not stored and cannot be referenced later.</li>
          <li>The final <code style={{ fontSize: 12 }}>response.completed</code> event in streaming output contains the complete usage information.</li>
        </ul>
      </section>

      {/* ───────── Related ───────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "OpenAI Chat Completions endpoint" },
          { href: "/docs/api/parameters", label: "Parameters", desc: "Detailed reference for all model parameters" },
          { href: "/docs/context-cache", label: "Context Cache", desc: "Reduce multi-turn conversation costs" },
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
