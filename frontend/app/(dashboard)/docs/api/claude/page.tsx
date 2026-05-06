import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const curlExample = `curl ${API_BASE}/v1/messages \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "用三句话解释什么是模型网关"}
    ]
  }'`;

const streamExample = `curl ${API_BASE}/v1/messages \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "写一段产品发布文案"}
    ]
  }'`;

export default function ClaudeDocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 5,
            background: "#f5f3ff",
            color: "#6d28d9",
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Anthropic Messages 兼容层
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Anthropic Messages 兼容 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          NexusFlow 提供 Anthropic Messages 请求/响应格式兼容入口，适合已有 Anthropic SDK 或 Claude Code 风格客户端迁移。
          这里是协议兼容层，不代表当前实例托管 Claude 原生模型；<code>model</code> 必须填写 NexusFlow 模型 ID，例如 <code>qwen3.6-plus</code>。
        </p>
      </div>

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
                ["model", true, "NexusFlow 模型 ID，例如 qwen3.6-plus、deepseek-v4-flash、glm-5.1"],
                ["messages", true, "Anthropic Messages 格式消息数组"],
                ["max_tokens", true, "最大输出 token 数"],
                ["stream", false, "设为 true 时返回 Anthropic SSE 事件流"],
                ["system", false, "系统提示词，会自动转换到内部对话格式"],
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

      <section style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>相关文档</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/docs/multi-protocol" style={{ color: "#1d4ed8" }}>多协议支持</Link>
          <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>OpenAI Chat Completions</Link>
          <Link href="/docs/api/gemini" style={{ color: "#1d4ed8" }}>Gemini 协议</Link>
        </div>
      </section>
    </div>
  );
}
