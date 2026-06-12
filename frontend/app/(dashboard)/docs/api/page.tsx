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
    desc: "Chat completion endpoint with multi-turn dialog, streaming, and function calling",
    href: "/docs/api/chat",
    params: [
      { name: "model", type: "string", required: true, desc: "Model ID, e.g. qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "Conversation message array" },
      { name: "stream", type: "boolean", required: false, desc: "Whether to enable streaming response" },
      { name: "temperature", type: "number", required: false, desc: "Sampling temperature 0-2" },
      { name: "max_tokens", type: "integer", required: false, desc: "Maximum number of generated tokens" },
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
    desc: "Anthropic Messages compatible endpoint, suitable for reusing the Anthropic SDK",
    href: "/docs/api/anthropic",
    params: [
      { name: "model", type: "string", required: true, desc: "NexusFlow model ID, e.g. qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "Anthropic Messages format message array" },
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
    path: "/v1beta/models/{model}:generateContent",
    desc: "Gemini GenerateContent compatible endpoint, suitable for migrating from existing Gemini SDKs",
    href: "/docs/api/gemini",
    params: [
      { name: "model", type: "path string", required: true, desc: "NexusFlow model ID, e.g. qwen3.6-plus" },
      { name: "contents", type: "array", required: true, desc: "Gemini contents message array" },
      { name: "generationConfig", type: "object", required: false, desc: "Generation parameters such as maxOutputTokens, temperature" },
    ],
    example: `curl "https://nexusflow.hk/v1beta/models/qwen3.6-plus:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}],
    "generationConfig": {"maxOutputTokens": 1024}
  }'`,
  },
  {
    method: "GET",
    path: "/v1/models",
    desc: "Get the list of available models and their information",
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
    desc: "Text embeddings endpoint that converts text into vector representations",
    href: "/docs/api/embeddings",
    params: [
      { name: "model", type: "string", required: true, desc: "Embedding model ID" },
      { name: "input", type: "string/array", required: true, desc: "Text to embed" },
    ],
    example: `curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "text-embedding-v4", "input": "test text"}'`,
  },
  {
    method: "POST",
    path: "/v1/tasks",
    desc: "Async tasks endpoint (unified submission for image / video)",
    href: "/docs/api/tasks",
    params: [
      { name: "model", type: "string", required: true, desc: "Model ID" },
      { name: "prompt", type: "string", required: true, desc: "Generation prompt" },
      { name: "size", type: "string", required: false, desc: "Output dimensions" },
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
  { title: "Three-protocol compatible", desc: "OpenAI, Anthropic Messages and Gemini-compatible share a single key, billing, and monitoring." },
  { title: "Streaming responses", desc: "The chat endpoint supports SSE streaming, ideal for real-time interaction with low latency." },
  { title: "Async tasks", desc: "Image and video go through a unified task endpoint, suitable for high-latency and high-concurrency scenarios." },
  { title: "Pre-launch validation", desc: "Combined with rate limits, error codes and the monitoring page, helps you identify traffic risks before production." },
];

const protocolCards = [
  { title: "OpenAI", href: "/docs/api/chat", endpoint: "/v1/chat/completions", desc: "Default recommendation, compatible with the OpenAI SDK." },
  { title: "Anthropic Messages", href: "/docs/api/anthropic", endpoint: "/v1/messages", desc: "Reuse the Anthropic SDK and Messages format." },
  { title: "Gemini-compatible", href: "/docs/api/gemini", endpoint: "/v1beta/models/{model}:generateContent", desc: "Reuse the Gemini GenerateContent format." },
];

const protocolBoundary = [
  ["Available", "OpenAI Chat / Anthropic Messages / Gemini-compatible", "Text, reasoning, vision understanding, code and specialized models are called per supported_protocols."],
  ["Available", "OpenAI Embeddings / Image Generations / NexusFlow Tasks", "Embeddings, image and video models use their corresponding endpoints by capability."],
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
        nexusflow's integration model is split into three compatible protocols and one async task endpoint. OpenAI, Anthropic Messages and Gemini-compatible requests all flow through the same model routing, billing and monitoring pipeline.
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Public gateway protocol scope</div>
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
            This page only lists public APIs that can currently be called directly against <code style={{ fontFamily: "var(--font-mono)" }}>https://nexusflow.hk</code>.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>Basic Information</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            ["Base URL", "https://nexusflow.hk"],
            ["Authentication", "Authorization: Bearer sk-air-xxx"],
            ["Request format", "Content-Type: application/json"],
            ["Response format", "JSON / Server-Sent Events / Task Status"],
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
            { title: "Chat", desc: "Use `/v1/chat/completions` by default; compatible with the OpenAI SDK." },
            { title: "Protocol", desc: "If you already have an Anthropic or Gemini client, use the corresponding compatible endpoint directly." },
            { title: "Tasks", desc: "Image and video models prefer `/v1/tasks` and `/v1/tasks/:id`; image generation also supports the OpenAI-style `/v1/images/generations`." },
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
                      View detailed documentation
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
