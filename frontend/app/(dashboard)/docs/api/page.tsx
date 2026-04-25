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
      { name: "model", type: "string", required: true, desc: "模型 ID，如 qwen3.5-plus" },
      { name: "messages", type: "array", required: true, desc: "对话消息数组" },
      { name: "stream", type: "boolean", required: false, desc: "是否启用流式响应" },
      { name: "temperature", type: "number", required: false, desc: "采样温度 0-2" },
      { name: "max_tokens", type: "integer", required: false, desc: "最大生成 token 数" },
    ],
    example: `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": false
  }'`,
  },
  {
    method: "GET",
    path: "/v1/models",
    desc: "获取可用模型列表及其信息",
    href: "/docs/models",
    responseExample: `{
  "object": "list",
  "data": [
    {"id": "qwen3.5-plus", "object": "model", "owned_by": "通义千问"},
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
  -d '{"model": "text-embedding-v3", "input": "测试文本"}'`,
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
  { title: "OpenAI 兼容", desc: "对话与向量接口保持 OpenAI 风格，迁移现有应用成本更低。" },
  { title: "流式响应", desc: "聊天接口支持 SSE 流式输出，适合实时交互和低等待感体验。" },
  { title: "异步任务", desc: "图像与视频统一走任务接口，适合高时延和高并发场景。" },
  { title: "上线前校验", desc: "配合限流、错误码和监控页，帮助你在生产前识别流量风险。" },
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
        nexusflow 的接入逻辑分成两条主线：文本与推理模型使用同步接口，多媒体生成使用异步任务接口。这样更适合真实生产环境的延迟与并发特征。
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
            { title: "Chat", desc: "文本、推理、代码模型使用 `/v1/chat/completions`。" },
            { title: "Tasks", desc: "图像、视频模型统一使用 `/v1/tasks` 与 `/v1/tasks/:id`。" },
            { title: "Production", desc: "高峰流量上线前，先确认限流、监控和错误处理策略。" },
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
                  <code style={{ fontSize: 14, fontFamily: "var(--font-mono)", color: "#111", flex: "0 0 200px" }}>{ep.path}</code>
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
