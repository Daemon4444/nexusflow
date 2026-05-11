import Link from "next/link";

const claudeModels = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    desc: "最强通用 Claude，适合复杂推理、Agentic Coding 和大型上下文任务。",
    context: "1M",
    output: "128K",
    usd: "$5 / $25",
    cny: "约 ¥34 / ¥170",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    desc: "速度与智能均衡的生产主力，适合代码、工具调用和多轮对话。",
    context: "1M",
    output: "64K",
    usd: "$3 / $15",
    cny: "约 ¥20.4 / ¥102",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    desc: "高速低成本 Claude，适合低延迟分类、抽取、批量处理和轻量对话。",
    context: "200K",
    output: "64K",
    usd: "$1 / $5",
    cny: "约 ¥6.8 / ¥34",
  },
];

export default function ClaudeModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 10 }}>
          Anthropic 官方渠道
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Claude 模型
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          NexusFlow 已加入 Claude 官方 Messages API 路由。Claude 模型通过 <code>/v1/messages</code> 调用，需要后端配置 <code>ANTHROPIC_API_KEY</code>。
          下方 USD 为 Anthropic 官方公开价格，人民币为当前项目计费字段按 <code>1 USD≈¥6.8</code> 折算。
        </p>
      </div>

      <section style={{ marginBottom: 36 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模型</th>
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
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>计费口径</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
          基础输入和输出 token 价格按 Anthropic 官方 Model pricing 表。Prompt cache 写入按 1.25x 输入价，cache hit 按 0.1x 输入价；Batch、data residency、server-side tools 等额外价格暂未在公共计费 UI 单独展开。
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
