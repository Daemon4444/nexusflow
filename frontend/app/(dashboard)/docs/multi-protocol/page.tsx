"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const openaiPython = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# Basic chat
response = client.chat.completions.create(
    model="qwen3-max",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`;

const openaiNode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3-max",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`;

const openaiStream = `stream = client.chat.completions.create(
    model="qwen3-max",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`;

const openaiImage = `response = client.images.generate(
    model="wan2.6-t2i",
    prompt="A futuristic city at sunset, cyberpunk style",
    size="1024x1024",
    n=1,
)
print(response.data[0].url)`;

const openaiEmbedding = `response = client.embeddings.create(
    model="text-embedding-v4",
    input="Your text string goes here",
)
print(response.data[0].embedding[:5])`;

const anthropicPython = `import anthropic

client = anthropic.Anthropic(
    api_key="sk-air-your-key",
    base_url="${API_BASE}",
)

message = client.messages.create(
    model="qwen3-max",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)`;

const anthropicNode = `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}",
});

const message = await client.messages.create({
  model: "qwen3-max",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(message.content[0].text);`;

const anthropicStream = `with client.messages.stream(
    model="qwen3-max",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="")`;

const responsesPython = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# Basic usage
response = client.responses.create(
    model="qwen3.7-plus",
    input="Hello!"
)
print(response.output_text)`;

const responsesNode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.responses.create({
  model: "qwen3.7-plus",
  input: "Hello!",
});
console.log(response.output_text);`;

const responsesTools = `# Using built-in tools
response = client.responses.create(
    model="qwen3.7-plus",
    input="Search today's news for me",
    tools=[
        {"type": "web_search"},
        {"type": "code_interpreter"},
        {"type": "web_extractor"},
    ],
)
print(response.output_text)`;

const responsesMultiTurn = `# Multi-turn conversation — link context via previous_response_id
response1 = client.responses.create(
    model="qwen3.7-plus",
    input="My name is Zhang San"
)

response2 = client.responses.create(
    model="qwen3.7-plus",
    input="Do you still remember my name?",
    previous_response_id=response1.id
)
print(response2.output_text)`;

const protocolBoundaryRows = [
  { name: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", status: "Available", note: "Recommended default endpoint for text, reasoning, multimodal, and coding models." },
  { name: "Anthropic Messages", endpoint: "/v1/messages", status: "Available", note: "Compatible with the Anthropic SDK and the Messages request/streaming event format." },
  { name: "Responses API", endpoint: "/v1/responses", status: "Available", note: "Built-in tools like web search and code interpreter, simplifying multi-turn context management." },
  { name: "OpenAI Image Generations", endpoint: "/v1/images/generations", status: "Available", note: "Synchronous compatible endpoint for image generation; complex image/video tasks can also use /v1/tasks." },
  { name: "OpenAI Embeddings", endpoint: "/v1/embeddings", status: "Available", note: "Endpoint for text embedding models." },
  { name: "NexusFlow Tasks", endpoint: "/v1/tasks", status: "Available", note: "Unified endpoint for image and video async tasks." },
];

export default function MultiProtocolPage() {
  const [openaiLang, setOpenaiLang] = useState("python");
  const [anthropicLang, setAnthropicLang] = useState("python");
  const [responsesLang, setResponsesLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Feature</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Multi-Protocol Support
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          Use familiar SDKs to connect to one gateway, with unified auth, billing, and monitoring
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow currently exposes three public protocols: OpenAI Chat Completions, Anthropic Messages, and Responses API.
          Internally these protocols connect through a compatibility layer to the same model routing, billing, and monitoring pipeline, so you can keep using familiar SDKs without leaking provider differences into your application.
          The Responses API offers built-in tools (web search, code interpreter, etc.) and previous_response_id multi-turn context management, ideal for complex tasks.
        </p>
        <div style={{
          marginTop: 18, padding: "14px 18px", borderRadius: 10,
          background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)",
          border: "1px solid #fcd34d",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8, letterSpacing: "0.3px" }}>
            ⚠ Protocol Coverage
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
            <div>
              <code style={{ fontSize: 12, fontWeight: 700 }}> /v1/chat/completions</code>
              <div style={{ marginTop: 2 }}>Supported by all models</div>
            </div>
            <div>
              <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/messages</code>
              <div style={{ marginTop: 2 }}>Supported by all models</div>
            </div>
          </div>
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: "1px dashed #fcd34d",
            fontSize: 13, color: "#92400e", lineHeight: 1.6,
          }}>
            <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/responses</code> — <strong>Qwen series only</strong>;
            calling DeepSeek / GLM / Kimi / MiniMax returns <code style={{ fontSize: 11 }}>Unsupported model</code>, so use the first two endpoints instead.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Supported Protocols</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Endpoint Prefix</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>SDK</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Main Use</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", sdk: "OpenAI SDK", usage: "Text chat, function calling" },
                { proto: "OpenAI Image Generations", endpoint: "/v1/images/generations", sdk: "OpenAI SDK", usage: "Image generation" },
                { proto: "OpenAI Embeddings", endpoint: "/v1/embeddings", sdk: "OpenAI SDK", usage: "Text embedding" },
                { proto: "Anthropic Messages", endpoint: "/v1/messages", sdk: "Anthropic SDK", usage: "Text chat, function calling" },
                { proto: "Responses API", endpoint: "/v1/responses", sdk: "OpenAI SDK", usage: "Built-in tools, multi-turn context" },
              ].map((row, idx) => (
                <tr key={row.proto} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.proto}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.endpoint}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.sdk}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          Not all models support all protocols. The model detail page shows each model's currently available <code style={{ fontFamily: "var(--font-mono)" }}>supported_protocols</code>.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Protocol Scope</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          The current NexusFlow public API lists only directly callable compatible endpoints. The model detail page shows the actual supported_protocols for each model.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol / API</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Endpoint</th>
                <th style={{ padding: "11px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {protocolBoundaryRows.map((row, idx) => (
                <tr key={row.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.endpoint}</code>
                  </td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: row.status === "Available" ? "#dcfce7" : "#f3f4f6",
                      color: row.status === "Available" ? "#166534" : "#6b7280",
                    }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.65 }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          Reference: <a href="https://platform.openai.com/docs/api-reference/chat" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>OpenAI Chat Completions API Reference</a>.
        </p>
      </section>

      {/* OpenAI Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          OpenAI Protocol
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          This is the most universal protocol, supported by most models. Compatible with the OpenAI Chat Completions API spec.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Basic Setup</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {["python", "nodejs"].map((l) => (
            <button key={l} onClick={() => setOpenaiLang(l)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: openaiLang === l ? "#333" : "transparent",
              color: openaiLang === l ? "#fff" : "var(--text-tertiary)",
            }}>
              {l === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiLang === "python" ? openaiPython : openaiNode} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Streaming</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiStream} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Image Generation</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Models that support the <code style={{ fontFamily: "var(--font-mono)" }}>openai:image-generations</code> protocol can generate images via the OpenAI SDK.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiImage} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Text Embedding</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Models that support the <code style={{ fontFamily: "var(--font-mono)" }}>openai:embeddings</code> protocol can convert text into vector representations for semantic search, clustering, RAG, and similar use cases.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={openaiEmbedding} />
        </div>
      </section>

      {/* Anthropic Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Anthropic Protocol
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Provides an Anthropic Messages compatible endpoint, making it easy to connect to nexusflow's unified model gateway directly with the Anthropic SDK.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Basic Setup</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {["python", "nodejs"].map((l) => (
            <button key={l} onClick={() => setAnthropicLang(l)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: anthropicLang === l ? "#333" : "transparent",
              color: anthropicLang === l ? "#fff" : "var(--text-tertiary)",
            }}>
              {l === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={anthropicLang === "python" ? anthropicPython : anthropicNode} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Streaming</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={anthropicStream} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Responses API
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Compared with Chat Completions, the Responses API offers more powerful capabilities: built-in tools like web search, web extraction, and code interpreter;
          and it simplifies multi-turn context management via <code style={{ fontFamily: "var(--font-mono)" }}>previous_response_id</code>, with no need to manually build the full message history.
          Call it via the OpenAI SDK's <code style={{ fontFamily: "var(--font-mono)" }}>client.responses.create()</code>.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Basic Usage</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {["python", "nodejs"].map((l) => (
            <button key={l} onClick={() => setResponsesLang(l)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: responsesLang === l ? "#333" : "transparent",
              color: responsesLang === l ? "#fff" : "var(--text-tertiary)",
            }}>
              {l === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={responsesLang === "python" ? responsesPython : responsesNode} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Built-in Tools</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={responsesTools} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Multi-turn Conversation</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={responsesMultiTurn} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Choosing a Protocol</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {[
            "If you use models like DeepSeek, Qwen, or GLM, the OpenAI Chat protocol is recommended for the best compatibility.",
            "If you already use the Anthropic SDK, prefer /v1/messages to reduce SDK migration cost.",
            "If you need built-in tools (web search, code interpreter) or previous_response_id multi-turn context, use /v1/responses.",
            "Check supported_protocols on the model detail page to confirm which protocols the model currently exposes.",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>{i + 1}.</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "Quick Start", desc: "Get started calling models quickly" },
            { href: "/docs/api-keys", label: "API Keys", desc: "Create and manage keys" },
            { href: "/docs/models", label: "Models", desc: "See which protocols each model supports" },
            { href: "/docs/provider-routing", label: "Provider Routing", desc: "Learn about the smart routing mechanism" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
