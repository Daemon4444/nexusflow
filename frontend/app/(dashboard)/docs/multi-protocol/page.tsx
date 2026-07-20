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

# 基本对话
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

# 基本调用
response = client.responses.create(
    model="qwen3.7-plus",
    input="你好！"
)
print(response.output_text)`;

const responsesNode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.responses.create({
  model: "qwen3.7-plus",
  input: "你好！",
});
console.log(response.output_text);`;

const responsesTools = `# 使用内置工具
response = client.responses.create(
    model="qwen3.7-plus",
    input="帮我搜索今天的新闻",
    tools=[
        {"type": "web_search"},
        {"type": "code_interpreter"},
        {"type": "web_extractor"},
    ],
)
print(response.output_text)`;

const responsesMultiTurn = `# 多轮对话 — 通过 previous_response_id 关联上下文
response1 = client.responses.create(
    model="qwen3.7-plus",
    input="我叫张三"
)

response2 = client.responses.create(
    model="qwen3.7-plus",
    input="你还记得我的名字吗？",
    previous_response_id=response1.id
)
print(response2.output_text)`;

const protocolBoundaryRows = [
  { name: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", status: "已开放", note: "文本、推理、多模态、编程模型的默认推荐入口。" },
  { name: "Anthropic Messages", endpoint: "/v1/messages", status: "已开放", note: "兼容 Anthropic SDK 和 Messages 请求/流式事件格式。" },
  { name: "Responses API", endpoint: "/v1/responses", status: "已开放", note: "内置联网搜索、代码解释器等工具，简化多轮对话上下文管理。" },
  { name: "OpenAI Image Generations", endpoint: "/v1/images/generations", status: "已开放", note: "图像生成的同步兼容入口；复杂图像/视频任务也可用 /v1/tasks。" },
  { name: "OpenAI Embeddings", endpoint: "/v1/embeddings", status: "已开放", note: "文本向量模型入口。" },
  { name: "NexusFlow Tasks", endpoint: "/v1/tasks", status: "已开放", note: "图像和视频异步任务统一入口。" },
];

export default function MultiProtocolPage() {
  const [openaiLang, setOpenaiLang] = useState("python");
  const [anthropicLang, setAnthropicLang] = useState("python");
  const [responsesLang, setResponsesLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>功能</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          多协议支持
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          使用熟悉的 SDK 直接接入同一网关，统一鉴权、统一计费、统一监控
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow 当前对外统一提供三类 public protocol：OpenAI Chat Completions、Anthropic Messages 和 Responses API。
          这些协议在平台内通过兼容层接到同一套模型路由、计费和监控链路上，目标是让你可以继续使用熟悉的 SDK，同时不把供应商差异泄漏到业务侧。
          Responses API 提供内置工具（联网搜索、代码解释器等）和 previous_response_id 多轮上下文管理，适合复杂任务场景。
        </p>
        <div style={{
          marginTop: 18, padding: "14px 18px", borderRadius: 10,
          background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)",
          border: "1px solid #fcd34d",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8, letterSpacing: "0.3px" }}>
            ⚠ 协议支持范围
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
            <div>
              <code style={{ fontSize: 12, fontWeight: 700 }}> /v1/chat/completions</code>
              <div style={{ marginTop: 2 }}>全部模型支持</div>
            </div>
            <div>
              <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/messages</code>
              <div style={{ marginTop: 2 }}>全部模型支持</div>
            </div>
          </div>
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: "1px dashed #fcd34d",
            fontSize: 13, color: "#92400e", lineHeight: 1.6,
          }}>
            <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/responses</code> — <strong>仅通义千问系列支持</strong>；
            DeepSeek / GLM / Kimi / MiniMax 调用会返回 <code style={{ fontSize: 11 }}>Unsupported model</code>，请改用前两个端点。
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持的协议</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>协议</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>端点前缀</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>对应 SDK</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>主要用途</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI Chat Completions", endpoint: "/v1/chat/completions", sdk: "OpenAI SDK", usage: "文本对话、工具调用" },
                { proto: "OpenAI Image Generations", endpoint: "/v1/images/generations", sdk: "OpenAI SDK", usage: "图像生成" },
                { proto: "OpenAI Embeddings", endpoint: "/v1/embeddings", sdk: "OpenAI SDK", usage: "文本向量化" },
                { proto: "Anthropic Messages", endpoint: "/v1/messages", sdk: "Anthropic SDK", usage: "文本对话、工具调用" },
                { proto: "Responses API", endpoint: "/v1/responses", sdk: "OpenAI SDK", usage: "内置工具、多轮上下文" },
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
          不是所有模型都支持所有协议。模型详情页会直接展示该模型当前开放的 <code style={{ fontFamily: "var(--font-mono)" }}>supported_protocols</code>；
          调用前还应确认 <code style={{ fontFamily: "var(--font-mono)" }}>availability</code> 为 <code style={{ fontFamily: "var(--font-mono)" }}>available</code>。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>协议边界</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          NexusFlow 当前 public API 只列出兼容入口；目录中的模型可能因上游凭据或健康状态临时不可用。模型详情页会同时展示 supported_protocols 和 availability。
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>协议 / 接口</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>端点</th>
                <th style={{ padding: "11px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>当前状态</th>
                <th style={{ padding: "11px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
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
                      background: row.status === "已开放" ? "#dcfce7" : "#f3f4f6",
                      color: row.status === "已开放" ? "#166534" : "#6b7280",
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
          参考：<a href="https://platform.openai.com/docs/api-reference/chat" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>OpenAI Chat Completions API Reference</a>。
        </p>
      </section>

      {/* OpenAI Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          OpenAI 协议
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          这是最通用的协议，大多数模型都支持。兼容 OpenAI Chat Completions API 规范。
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>基本配置</h3>
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

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>流式输出</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiStream} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>图像生成</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          支持 <code style={{ fontFamily: "var(--font-mono)" }}>openai:image-generations</code> 协议的模型可以通过 OpenAI SDK 生成图像。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={openaiImage} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>文本向量化</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          支持 <code style={{ fontFamily: "var(--font-mono)" }}>openai:embeddings</code> 协议的模型可以将文本转为向量表示，用于语义搜索、聚类、RAG 等场景。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={openaiEmbedding} />
        </div>
      </section>

      {/* Anthropic Protocol */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Anthropic 协议
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          提供 Anthropic Messages 兼容入口，便于使用 Anthropic SDK 直接接入 nexusflow 的统一模型网关。
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>基本配置</h3>
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

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>流式输出</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={anthropicStream} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Responses API
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Responses API 相较于 Chat Completions 提供了更强大的能力：内置联网搜索、网页抓取、代码解释器等工具；
          通过 <code style={{ fontFamily: "var(--font-mono)" }}>previous_response_id</code> 简化多轮对话上下文管理，无需手动构建完整消息历史。
          使用 OpenAI SDK 的 <code style={{ fontFamily: "var(--font-mono)" }}>client.responses.create()</code> 即可调用。
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>基本调用</h3>
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

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>内置工具</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 24 }}>
          <DocsCodeBlock code={responsesTools} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>多轮对话</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={responsesMultiTurn} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>协议选择建议</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {[
            "如果你使用的是 DeepSeek、Qwen、GLM 等国产模型，推荐使用 OpenAI Chat 协议，兼容性最好。",
            "如果你已经在用 Anthropic SDK，可以优先使用 /v1/messages，减少 SDK 迁移成本。",
            "如果你需要内置工具（联网搜索、代码解释器）或 previous_response_id 多轮上下文，使用 /v1/responses。",
            "在模型详情页查看 supported_protocols，确认该模型当前开放了哪些协议。",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>{i + 1}.</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>相关文档</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "快速开始", desc: "快速上手调用模型" },
            { href: "/docs/api-keys", label: "API 密钥", desc: "创建和管理密钥" },
            { href: "/docs/models", label: "模型列表", desc: "查看模型支持的协议" },
            { href: "/docs/provider-routing", label: "供应商路由", desc: "了解智能路由机制" },
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
