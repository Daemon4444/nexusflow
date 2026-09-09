import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const curlExample = `curl ${API_BASE}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-5",
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
  { publicId: "claude-sonnet-5", snapshotId: "claude-sonnet-5-20260820", context: "1M", output: "128K", usd: "$2 / $10" },
  { publicId: "claude-opus-5", snapshotId: "claude-opus-5-20260820", context: "1M", output: "128K", usd: "$5 / $25" },
  { publicId: "claude-fable-5", snapshotId: "claude-fable-5-20260820", context: "1M", output: "128K", usd: "$10 / $50" },
  { publicId: "claude-opus-4-8", snapshotId: "claude-opus-4-8-20260820", context: "1M", output: "128K", usd: "$5 / $25" },
  { publicId: "claude-opus-4-7", snapshotId: "claude-opus-4-7-20260820", context: "1M", output: "128K", usd: "$5 / $25" },
  { publicId: "claude-sonnet-4-6", snapshotId: "claude-sonnet-4-6-20260820", context: "1M", output: "64K", usd: "$3 / $15" },
  { publicId: "claude-haiku-4-5", snapshotId: "claude-haiku-4-5-20260820", context: "200K", output: "64K", usd: "$1 / $5" },
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
          Claude 系列通过 HiModels 的原生 Anthropic Messages 兼容上游接入，而不是由 NexusFlow 直连 Anthropic 官方 API。
          客户端始终提交不带日期后缀的稳定公共模型 ID；NexusFlow 将其映射到下表所列的 HiModels 固定快照。同步 <code>/v1/messages</code> 与 SSE 流式响应均已验证。
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
            下列七个 Claude 公共 ID 均使用 HiModels 原生 Anthropic Messages 兼容路径；非流式响应与 Anthropic SSE 事件流均已验证。
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
                ["model", true, "稳定公共模型 ID，例如 claude-sonnet-5、claude-opus-5"],
                ["messages", true, "Anthropic Messages 格式消息数组"],
                ["max_tokens", true, "最大输出 token 数，不得超过该模型上限"],
                ["stream", false, "设为 true 时返回 Anthropic SSE 事件流"],
                ["system", false, "系统提示词，使用 Anthropic 顶层 system 字段"],
                ["tools", false, "是否支持及具体行为取决于所选模型和 HiModels 上游能力；使用前请核对当前模型说明"],
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
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>公共模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>HiModels 上游快照 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>最大输出</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>USD / MTok 输入/输出</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, i) => (
                <tr key={model.publicId} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{model.publicId}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{model.snapshotId}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model.context}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model.output}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.usd}</td>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Usage 与可选能力</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 14 }}>
          已验证的同步和流式响应会返回 Anthropic Messages 格式的 <code>usage</code>。上游响应可能包含
          <code> cache_creation_input_tokens</code> 与 <code>cache_read_input_tokens</code> 等缓存统计字段。
        </p>
        <div style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
          缓存统计字段存在不代表七个模型都接受 <code>cache_control</code>，工具定义也不是全系列统一承诺。
          请按当前模型与 HiModels 渠道说明启用可选能力；NexusFlow 不把未验证能力作为所有 Claude 模型的通用保证。
        </div>
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
