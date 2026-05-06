"use client";

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
    desc: "对话补全接口，支持多轮对话、流式输出、函数调用等",
    href: "/docs/api/chat",
    params: [
      { name: "model", type: "string", required: true, desc: "模型 ID，如 qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "对话消息数组" },
      { name: "stream", type: "boolean", required: false, desc: "是否启用流式响应" },
      { name: "temperature", type: "number", required: false, desc: "采样温度 0-2" },
      { name: "max_tokens", type: "integer", required: false, desc: "最大生成 token 数" },
    ],
    example: `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": false
  }'`,
  },
  {
    method: "POST",
    path: "/v1/messages",
    desc: "Anthropic Messages 兼容接口，适合复用 Anthropic SDK",
    href: "/docs/api/anthropic",
    params: [
      { name: "model", type: "string", required: true, desc: "NexusFlow 模型 ID，如 qwen3.6-plus" },
      { name: "messages", type: "array", required: true, desc: "Anthropic Messages 格式消息数组" },
      { name: "max_tokens", type: "integer", required: true, desc: "最大输出 token 数" },
      { name: "stream", type: "boolean", required: false, desc: "是否返回 Anthropic SSE 事件流" },
    ],
    example: `curl https://nexusflow.hk/v1/messages \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "你好！"}]
  }'`,
  },
  {
    method: "POST",
    path: "/v1beta/models/{model}:generateContent",
    desc: "Gemini GenerateContent 兼容接口，适合已有 Gemini SDK 迁移",
    href: "/docs/api/gemini",
    params: [
      { name: "model", type: "path string", required: true, desc: "NexusFlow 模型 ID，如 qwen3.6-plus" },
      { name: "contents", type: "array", required: true, desc: "Gemini contents 消息数组" },
      { name: "generationConfig", type: "object", required: false, desc: "生成参数，如 maxOutputTokens、temperature" },
    ],
    example: `curl "https://nexusflow.hk/v1beta/models/qwen3.6-plus:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "你好！"}]}],
    "generationConfig": {"maxOutputTokens": 1024}
  }'`,
  },
  {
    method: "GET",
    path: "/v1/models",
    desc: "获取可用模型列表及其信息",
    href: "/docs/models",
    example: `curl https://nexusflow.hk/v1/models \\
  -H "Authorization: Bearer $API_KEY"`,
    responseExample: `{
  "object": "list",
  "data": [
    {"id": "qwen3.6-plus", "object": "model", "owned_by": "通义千问"},
    {"id": "deepseek-r1", "object": "model", "owned_by": "DeepSeek"}
  ]
}`,
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    desc: "文本向量接口，将文本转换为向量表示",
    href: "/docs/api/embeddings",
    params: [
      { name: "model", type: "string", required: true, desc: "向量模型 ID" },
      { name: "input", type: "string/array", required: true, desc: "要向量化的文本" },
    ],
    example: `curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "text-embedding-v4", "input": "测试文本"}'`,
  },
  {
    method: "POST",
    path: "/v1/tasks",
    desc: "异步任务接口（图像 / 视频统一提交）",
    href: "/docs/api/tasks",
    params: [
      { name: "model", type: "string", required: true, desc: "模型 ID" },
      { name: "prompt", type: "string", required: true, desc: "生成提示词" },
      { name: "size", type: "string", required: false, desc: "输出尺寸" },
      { name: "duration", type: "integer", required: false, desc: "视频时长" },
    ],
    example: `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "wan2.6-t2i", "prompt": "生成一张美丽的风景图"}'`,
  },
  {
    method: "GET",
    path: "/v1/tasks/:id",
    desc: "查询异步任务状态",
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
  { title: "三协议兼容", desc: "OpenAI、Anthropic Messages、Gemini-compatible 共用一套 Key、计费和监控。" },
  { title: "流式响应", desc: "聊天接口支持 SSE 流式输出，适合实时交互和低等待感体验。" },
  { title: "异步任务", desc: "图像与视频统一走任务接口，适合高时延和高并发场景。" },
  { title: "上线前校验", desc: "配合限流、错误码和监控页，帮助你在生产前识别流量风险。" },
];

const protocolCards = [
  { title: "OpenAI", href: "/docs/api/chat", endpoint: "/v1/chat/completions", desc: "默认推荐，兼容 OpenAI SDK。" },
  { title: "Anthropic Messages", href: "/docs/api/anthropic", endpoint: "/v1/messages", desc: "复用 Anthropic SDK 和 Messages 格式。" },
  { title: "Gemini-compatible", href: "/docs/api/gemini", endpoint: "/v1beta/models/{model}:generateContent", desc: "复用 Gemini GenerateContent 格式。" },
];

const protocolBoundary = [
  ["已开放", "OpenAI Chat / Anthropic Messages / Gemini-compatible", "文本、推理、视觉理解、编程和专业模型按 supported_protocols 调用。"],
  ["已开放", "OpenAI Embeddings / Image Generations / NexusFlow Tasks", "向量、图像和视频模型按能力使用对应接口。"],
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
        API 参考
      </h1>
      <p style={{ fontSize: 15, color: "#666", marginBottom: 40, lineHeight: 1.7 }}>
        nexusflow 的接入逻辑分成三类兼容协议和一套异步任务接口。OpenAI、Anthropic Messages、Gemini-compatible 请求都会接入同一套模型路由、计费和监控链路。
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>兼容协议</h2>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>公开网关协议边界</div>
          <div style={{ display: "grid", gap: 8 }}>
            {protocolBoundary.map(([status, name, desc]) => (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1.8fr", gap: 12, alignItems: "center", fontSize: 13 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, textAlign: "center",
                  background: status === "已开放" ? "#dcfce7" : "#f3f4f6",
                  color: status === "已开放" ? "#166534" : "#6b7280",
                }}>{status}</span>
                <span style={{ color: "#111", fontWeight: 600 }}>{name}</span>
                <span style={{ color: "#666", lineHeight: 1.6 }}>{desc}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.7, margin: "12px 0 0" }}>
            本页只列出当前可直接请求 <code style={{ fontFamily: "var(--font-mono)" }}>https://nexusflow.hk</code> 的 public API。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>基本信息</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            ["Base URL", "https://nexusflow.hk"],
            ["认证方式", "Authorization: Bearer sk-air-xxx"],
            ["请求格式", "Content-Type: application/json"],
            ["响应格式", "JSON / Server-Sent Events / Task Status"],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: 20, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
              <code style={{ fontSize: 14, fontFamily: "var(--font-mono)", color: "#111" }}>{value}</code>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>推荐接入方式</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { title: "Chat", desc: "默认使用 `/v1/chat/completions`，兼容 OpenAI SDK。" },
            { title: "Protocol", desc: "已有 Anthropic 或 Gemini 客户端时，直接使用对应兼容入口。" },
            { title: "Tasks", desc: "图像、视频模型优先使用 `/v1/tasks` 与 `/v1/tasks/:id`；图像也支持 OpenAI 风格 `/v1/images/generations`。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#666" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111", marginBottom: 20 }}>API 端点</h2>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>请求参数</div>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>示例</div>
                        <pre style={{ margin: 0, padding: 16, background: "#111827", color: "#e5e7eb", borderRadius: 8, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7 }}>
                          <code>{ep.example}</code>
                        </pre>
                      </div>
                    )}

                    {ep.responseExample && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>响应</div>
                        <pre style={{ margin: 0, padding: 16, background: "#111827", color: "#e5e7eb", borderRadius: 8, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7 }}>
                          <code>{ep.responseExample}</code>
                        </pre>
                      </div>
                    )}

                    <Link href={ep.href} style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                      查看详细文档
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
