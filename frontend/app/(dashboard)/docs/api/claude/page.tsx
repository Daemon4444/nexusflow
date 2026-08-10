import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const curlExample = `curl ${API_BASE}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "用三句话解释什么是模型网关"}
    ]
  }'`;

const streamExample = `curl ${API_BASE}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "写一段产品发布文案"}
    ]
  }'`;

const models = [
  ["claude-opus-4-7", "1M", "128K", "$5 / $25"],
  ["claude-sonnet-4-6", "1M", "64K", "$3 / $15"],
  ["claude-haiku-4-5", "200K", "64K", "$1 / $5"],
];

export default function ClaudeDocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 5,
            background: "#fffbeb",
            color: "#b45309",
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Claude Messages API
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Claude API 接入
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 780, margin: 0 }}>
          NexusFlow 的 <code>/v1/messages</code> 同时支持 Anthropic 原生 Claude 模型和兼容层模型。
          当 <code>model</code> 为 <code>claude-*</code> 时，请求会直连 Anthropic 官方 Messages API，并保留原生响应与 SSE 事件格式。
        </p>
      </div>

      {/* ───────── Protocol Limit ───────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{
          padding: "14px 18px", borderRadius: 10,
          background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
          border: "1px solid #6ee7b7",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 6, letterSpacing: "0.3px" }}>
            ✓ 协议支持范围
          </div>
          <div style={{ fontSize: 13, color: "#065f46", lineHeight: 1.7 }}>
            <code style={{ fontSize: 12, fontWeight: 700 }}>/v1/messages</code> 支持 NexusFlow 接入的全部模型 — 包含 Claude 官方系列，以及通义千问、GLM、DeepSeek、Kimi、MiniMax 等。
            JSON 请求体兼容固定 <code>Content-Length</code>、HTTP/1.1 chunked，以及不携带 <code>Content-Length</code> 的 HTTP/2 客户端。
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>接口地址</h2>
        <div
          style={{
            padding: "12px 18px",
            background: "var(--bg-elevated)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>POST</span>
          <code style={{ fontSize: 13, flex: 1 }}>{API_BASE}/v1/messages</code>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>同步 / 流式</span>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必选</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["model", true, "Claude 模型 ID，例如 claude-sonnet-4-6、claude-opus-4-7"],
                ["messages", true, "Anthropic Messages 格式消息数组"],
                ["max_tokens", true, "最大输出 token 数"],
                ["stream", false, "设为 true 时返回 Anthropic SSE 事件流"],
                ["system", false, "系统提示词，使用 Anthropic 顶层 system 字段"],
                ["tools", false, "Anthropic 工具定义；Claude 模型会原样转发给官方 API"],
              ].map(([name, required, desc], i) => (
                <tr key={String(name)} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{String(name)}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: required ? "#dc2626" : "var(--text-tertiary)" }}>{required ? "是" : "否"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{String(desc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>支持模型与官方价格</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>最大输出</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>USD / MTok 输入/输出</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, i) => (
                <tr key={model[0]} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{model[0]}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model[1]}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model[2]}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>调用示例</h2>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <DocsCodeBlock code={curlExample} />
          </div>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <DocsCodeBlock code={streamExample} />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Prompt Caching（上下文缓存）</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 14 }}>
          通过 <code>/v1/messages</code> 调用时支持 Prompt Caching。在 system 或 messages 的 content block 上添加 <code>cache_control</code> 注解，重复前缀将被缓存，后续请求命中缓存部分享受 90% 折扣：
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>Token 类型</span><span>计费倍率</span><span>说明</span>
          </div>
          {[
            ["cache_creation_input_tokens", "1.25x", "首次写入缓存"],
            ["cache_read_input_tokens", "0.1x", "命中缓存，90% 折扣"],
            ["input_tokens", "1x", "未缓存部分，正常计费"],
          ].map(([type, rate, desc], i) => (
            <div key={type} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", borderBottom: i < 2 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <code style={{ fontSize: 11 }}>{type}</code>
              <span style={{ color: "var(--success)", fontWeight: 500 }}>{rate}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          用法示例：在 system 块上添加 <code>{`"cache_control": {"type": "ephemeral"}`}</code>。适用于长 system prompt、文档上下文等重复内容。所有 <code>/v1/messages</code> 协议下的模型均支持。
        </p>
      </section>

      <section style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>相关文档</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/docs/models/claude" style={{ color: "#1d4ed8" }}>Claude 模型</Link>
          <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>OpenAI Chat Completions</Link>
          <Link href="/pricing" style={{ color: "#1d4ed8" }}>完整定价</Link>
        </div>
      </section>
    </div>
  );
}
