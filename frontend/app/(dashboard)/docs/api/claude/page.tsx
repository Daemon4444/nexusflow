import Link from "next/link";

const alternatives = [
  {
    href: "/docs/models/qwen",
    label: "通义千问",
    desc: "当前主力通用模型，支持 OpenAI 兼容调用。",
  },
  {
    href: "/docs/models/deepseek",
    label: "DeepSeek",
    desc: "适合推理、代码和高性价比对话场景。",
  },
  {
    href: "/docs/api/chat",
    label: "对话补全 API",
    desc: "查看统一接口、参数和请求示例。",
  },
];

export default function ClaudeDocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          UNAVAILABLE
        </span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
        Claude API 当前未在此实例开放
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.7, maxWidth: 720 }}>
        当前 nexusflow 线上实例使用统一网关聚合已接入的 Qwen、DeepSeek、GLM、Kimi、MiniMax、HappyHorse
        等模型能力。Claude 相关路由暂未对外开放，因此本页不再提供可调用模型列表和示例代码，避免与实际可用能力不一致。
      </p>

      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(248,113,113,0.08), rgba(251,191,36,0.06))",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
            当前状态
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            本站公开文档、模型目录和统一 API 只展示已在后端模型注册表中启用并通过联调验证的能力。
            如果后续重新接入 Claude，这个页面会恢复为真实可调用的接口文档。
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          你现在可以直接使用
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {alternatives.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: 18,
                background: "var(--bg-elevated)",
                borderRadius: 10,
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
