import Link from "next/link";

const claudeModels = [
  {
    id: "claude-sonnet-5",
    snapshotId: "claude-sonnet-5-20260820",
    name: "Claude Sonnet 5",
    desc: "NexusFlow 当前优先推荐的 Claude，适合生产级对话、复杂分析与长上下文工作流。",
    context: "1M",
    output: "128K",
    usd: "$2 / $10",
    cny: "¥13.6 / ¥68",
  },
  {
    id: "claude-opus-5",
    snapshotId: "claude-opus-5-20260820",
    name: "Claude Opus 5",
    desc: "高能力 Claude 5 型号，面向复杂分析与长程任务。",
    context: "1M",
    output: "128K",
    usd: "$5 / $25",
    cny: "¥34 / ¥170",
  },
  {
    id: "claude-fable-5",
    snapshotId: "claude-fable-5-20260820",
    name: "Claude Fable 5",
    desc: "Claude 5 系列高阶型号，适合对质量要求较高的长上下文任务。",
    context: "1M",
    output: "128K",
    usd: "$10 / $50",
    cny: "¥68 / ¥340",
  },
  {
    id: "claude-opus-4-8",
    snapshotId: "claude-opus-4-8-20260820",
    name: "Claude Opus 4.8",
    desc: "Opus 4 系列新快照对应的稳定公共入口。",
    context: "1M",
    output: "128K",
    usd: "$5 / $25",
    cny: "¥34 / ¥170",
  },
  {
    id: "claude-opus-4-7",
    snapshotId: "claude-opus-4-7-20260820",
    name: "Claude Opus 4.7",
    desc: "适合复杂推理与大型上下文任务。",
    context: "1M",
    output: "128K",
    usd: "$5 / $25",
    cny: "¥34 / ¥170",
  },
  {
    id: "claude-sonnet-4-6",
    snapshotId: "claude-sonnet-4-6-20260820",
    name: "Claude Sonnet 4.6",
    desc: "速度与智能均衡，适合代码和多轮对话。",
    context: "1M",
    output: "64K",
    usd: "$3 / $15",
    cny: "¥20.4 / ¥102",
  },
  {
    id: "claude-haiku-4-5",
    snapshotId: "claude-haiku-4-5-20260820",
    name: "Claude Haiku 4.5",
    desc: "高速低成本 Claude，适合低延迟分类、抽取、批量处理和轻量对话。",
    context: "200K",
    output: "64K",
    usd: "$1 / $5",
    cny: "¥6.8 / ¥34",
  },
];

export default function ClaudeModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 10 }}>
          HiModels · 原生 Anthropic Messages 兼容
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Claude 模型
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          Claude 模型通过 HiModels 原生 Anthropic Messages 兼容上游接入，不是 NexusFlow 直连 Anthropic 官方 API；客户无需另备 Anthropic 官方凭据。
          调用时使用稳定公共 ID；日期快照仅用于说明上游映射。下方 USD 为官方公开输入/输出价格，人民币按 <code>1 USD≈¥6.8</code> 折算。
        </p>
      </div>

      <section style={{ marginBottom: 36 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>公共模型 ID</th>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>HiModels 上游快照 ID</th>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>场景</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>上下文</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>最大输出</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>官方 USD / MTok</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>NexusFlow 计费</th>
              </tr>
            </thead>
            <tbody>
              {claudeModels.map((model, i) => (
                <tr key={model.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{model.name}</div>
                    <code style={{ fontSize: 12 }}>{model.id}</code>
                  </td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{model.snapshotId}</code></td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {model.desc}
                  </td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.context}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.output}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.usd}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)", fontWeight: 700 }}>{model.cny}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>计费与能力口径</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
          表中基础输入和输出价格按官方 USD 价格以 6.8 汇率换算。已验证的 <code>/v1/messages</code> 响应会提供 usage，且可能包含缓存 token 字段；
          但缓存控制、工具及其他可选能力取决于具体模型和 HiModels 渠道，不在此按 Claude 全系列统一承诺。
        </p>
      </section>

      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/claude", label: "Claude API", desc: "查看 /v1/messages 调用方式" },
            { href: "/models", label: "模型目录", desc: "查看所有可用模型" },
            { href: "/pricing", label: "完整定价", desc: "按供应商浏览价格" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
