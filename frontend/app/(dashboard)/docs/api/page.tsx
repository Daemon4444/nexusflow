"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

interface ApiEndpoint {
  method: string;
  path: string;
  desc: string;
  href: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  example?: string;
  responseExample?: string;
}

const endpoints: ApiEndpoint[] = [
  {
    method: "POST",
    path: "/v1/chat/completions",
    desc: "Chat Completions endpoint with multi-turn conversations, streaming, and function calling",
    href: "/docs/api/chat",
    params: [
      { name: "model", type: "string", required: true, desc: "Model ID, e.g. qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "Array of conversation messages" },
      { name: "stream", type: "boolean", required: false, desc: "Whether to enable streaming responses" },
      { name: "temperature", type: "number", required: false, desc: "Sampling temperature, 0-2" },
      { name: "max_tokens", type: "integer", required: false, desc: "Maximum number of tokens to generate" },
    ],
    example: `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'`,
  },
  {
    method: "POST",
    path: "/v1/messages",
    desc: "Anthropic Messages compatible endpoint, ideal for reusing the Anthropic SDK",
    href: "/docs/api/anthropic",
    params: [
      { name: "model", type: "string", required: true, desc: "NexusFlow model ID, e.g. qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "Array of messages in Anthropic Messages format" },
      { name: "max_tokens", type: "integer", required: true, desc: "Maximum number of output tokens" },
      { name: "stream", type: "boolean", required: false, desc: "Whether to return an Anthropic SSE event stream" },
    ],
    example: `curl https://nexusflow.hk/v1/messages \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  },
  {
    method: "POST",
    path: "/v1/responses",
    desc: "Responses API with built-in tools (web search, code interpreter, etc.) and multi-turn context management",
    href: "/docs/api/responses",
    params: [
      { name: "model", type: "string", required: true, desc: "Model ID, e.g. qwen3.7-plus" },
      { name: "input", type: "string/array", required: true, desc: "Plain text or an array of messages" },
      { name: "stream", type: "boolean", required: false, desc: "Whether to enable streaming output" },
      { name: "tools", type: "array", required: false, desc: "List of tools (web_search, code_interpreter, etc.)" },
      { name: "previous_response_id", type: "string", required: false, desc: "Previous response ID, used for multi-turn conversations" },
    ],
    example: `curl https://nexusflow.hk/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.7-plus",
    "input": "Hello!"
  }'`,
  },
  {
    method: "GET",
    path: "/v1/models",
    desc: "Retrieve the list of available models and their information",
    href: "/docs/models",
    example: `curl https://nexusflow.hk/v1/models \\
  -H "Authorization: Bearer $API_KEY"`,
    responseExample: `{
  "object": "list",
  "data": [
    {"id": "qwen3.6-plus", "object": "model", "owned_by": "Qwen"},
    {"id": "deepseek-r1", "object": "model", "owned_by": "DeepSeek"}
  ]
}`,
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    desc: "Embedding endpoint that converts text into vector representations",
    href: "/docs/api/embeddings",
    params: [
      { name: "model", type: "string", required: true, desc: "Embedding model ID" },
      { name: "input", type: "string/array", required: true, desc: "Text to embed" },
    ],
    example: `curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "text-embedding-v4", "input": "Sample text"}'`,
  },
  {
    method: "POST",
    path: "/v1/tasks",
    desc: "Async task endpoint (unified submission for image / video)",
    href: "/docs/api/tasks",
    params: [
      { name: "model", type: "string", required: true, desc: "Model ID" },
      { name: "prompt", type: "string", required: true, desc: "Generation prompt" },
      { name: "size", type: "string", required: false, desc: "Output size" },
      { name: "duration", type: "integer", required: false, desc: "Video duration" },
    ],
    example: `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "wan2.6-t2i", "prompt": "Generate a beautiful landscape image"}'`,
  },
  {
    method: "GET",
    path: "/v1/tasks/:id",
    desc: "Query async task status",
    href: "/docs/api/tasks",
    responseExample: `{
  "id": "task-xxx",
  "status": "succeeded",
  "progress": 100,
  "output": {"type": "image", "results": [{"url": "https://..."}]}
}`,
  },
];

const features = [
  { title: "Three-Protocol Compatibility", desc: "OpenAI Chat, Anthropic Messages, and Responses API share one set of keys, billing, and monitoring." },
  { title: "Streaming Responses", desc: "Chat endpoints support SSE streaming, ideal for real-time interaction and low-latency experiences." },
  { title: "Async Tasks", desc: "Image and video use a unified task API, ideal for high-latency and high-concurrency scenarios." },
  { title: "Pre-Launch Validation", desc: "Combined with rate limits, error codes, and the monitoring page to help you spot traffic risks before production." },
];

const protocolCards = [
  { title: "OpenAI Chat", href: "/docs/api/chat", endpoint: "/v1/chat/completions", desc: "Recommended default, compatible with the OpenAI SDK." },
  { title: "Anthropic Messages", href: "/docs/api/anthropic", endpoint: "/v1/messages", desc: "Reuse the Anthropic SDK and Messages format." },
  { title: "Responses API", href: "/docs/api/responses", endpoint: "/v1/responses", desc: "Built-in web search and code interpreter, simplifying multi-turn context management." },
];

const protocolBoundary = [
  ["Available", "OpenAI Chat / Anthropic Messages / Responses API", "Text, reasoning, vision, coding, and specialized models are called per supported_protocols."],
  ["Available", "OpenAI Embeddings / Image Generations / NexusFlow Tasks", "Embedding, image, and video models use the corresponding endpoints by capability."],
];

export default function ApiOverviewPage() {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  function getMethodColor(method: string) {
    switch (method) {
      case "GET": return "#22c55e";
      case "POST": return "#3b82f6";
      default: return "#666";
    }
  }

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000, fontFamily: "var(--font-sans)" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: "#111", marginBottom: 8, letterSpacing: "-0.5px" }}>
        API Reference
      </h1>
      <p style={{ fontSize: 15, color: "#666", marginBottom: 40, lineHeight: 1.7 }}>
        nexusflow access is organized into three compatible protocols plus one async task API. OpenAI Chat, Anthropic Messages, and Responses API requests all flow through the same model routing, billing, and monitoring pipeline.
      </p>

      <section style={{ marginBottom: 48 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {features.map((item) => (
            <div key={item.title} style={{ padding: 18, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#666" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>Compatible Protocols</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {protocolCards.map((item) => (
            <Link key={item.title} href={item.href} style={{ padding: 18, background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 }}>{item.title}</div>
              <code style={{ display: "block", fontSize: 12, color: "#2563eb", marginBottom: 10, fontFamily: "var(--font-mono)" }}>{item.endpoint}</code>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#666" }}>{item.desc}</div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 16, background: "#fafafa", border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Public Gateway Protocol Scope</div>
          <div style={{ display: "grid", gap: 8 }}>
            {protocolBoundary.map(([status, name, desc]) => (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1.8fr", gap: 12, alignItems: "center", fontSize: 13 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, textAlign: "center",
                  background: status === "Available" ? "#dcfce7" : "#f3f4f6",
                  color: status === "Available" ? "#166534" : "#6b7280",
                }}>{status}</span>
                <span style={{ color: "#111", fontWeight: 600 }}>{name}</span>
                <span style={{ color: "#666", lineHeight: 1.6 }}>{desc}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.7, margin: "12px 0 0" }}>
            This page lists only the public APIs you can currently call directly at <code style={{ fontFamily: "var(--font-mono)" }}>https://nexusflow.hk</code>.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>Basics</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            ["Base URL", "https://nexusflow.hk"],
            ["Authentication", "Authorization: Bearer sk-air-xxx"],
            ["Request Format", "Content-Type: application/json"],
            ["Response Format", "JSON / Server-Sent Events / Task Status"],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: 20, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
              <code style={{ fontSize: 14, fontFamily: "var(--font-mono)", color: "#111" }}>{value}</code>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>Recommended Integration</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { title: "Chat", desc: "Use `/v1/chat/completions` by default, compatible with the OpenAI SDK." },
            { title: "Protocol", desc: "If you already have an Anthropic client or need the Responses API format, use the corresponding compatible endpoint." },
            { title: "Tasks", desc: "Image and video models prefer `/v1/tasks` and `/v1/tasks/:id`; images also support OpenAI-style `/v1/images/generations`." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#666" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>API Endpoints</h2>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
          {endpoints.map((ep, idx) => {
            const isExpanded = expandedEndpoint === ep.path;
            const methodColor = getMethodColor(ep.method);

            return (
              <div key={ep.path}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 20px",
                    borderBottom: idx < endpoints.length - 1 ? "1px solid #f0f0f0" : "none",
                    background: isExpanded ? "#f8f8f8" : "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedEndpoint(isExpanded ? null : ep.path)}
                >
                  <span style={{ display: "inline-block", padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: `${methodColor}15`, color: methodColor, fontFamily: "var(--font-mono)" }}>
                    {ep.method}
                  </span>
                  <code style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "#111", flex: "0 0 330px", overflowWrap: "anywhere" }}>{ep.path}</code>
                  <span style={{ fontSize: 14, color: "#666", flex: 1 }}>{ep.desc}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: 20, background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    {ep.params && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>Request Parameters</div>
                        <div style={{ border: "1px solid #e5e5e5", borderRadius: 8, overflow: "hidden" }}>
                          {ep.params.map((param, index) => (
                            <div key={param.name} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", padding: "12px 16px", background: index % 2 === 0 ? "#fff" : "#fafafa", borderTop: index === 0 ? "none" : "1px solid #f0f0f0", fontSize: 13 }}>
                              <code>{param.name}</code>
                              <span style={{ color: "#666" }}>{param.type}</span>
                              <span style={{ color: "#666" }}>{param.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {ep.example && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>Example</div>
                        <DocsCodeBlock code={ep.example} />
                      </div>
                    )}

                    {ep.responseExample && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>Response</div>
                        <DocsCodeBlock code={ep.responseExample} />
                      </div>
                    )}

                    <Link href={ep.href} style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                      View detailed docs
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
