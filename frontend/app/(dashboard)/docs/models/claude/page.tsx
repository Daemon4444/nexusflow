import Link from "next/link";

export default function ClaudeModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.5px" }}>
              Claude 系列暂未开放
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              Reserved Route
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          这个页面保留为历史路由占位，但当前 nexusflow 线上实例并未开放 Claude 模型调用。
          为了保证官网、文档和实际接口能力一致，这里不再展示价格、上下文和示例代码。
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          当前建议使用
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "Q", label: "通义千问", desc: "通用主力模型" },
            { icon: "D", label: "DeepSeek", desc: "推理与代码" },
            { icon: "G", label: "GLM", desc: "中文场景均衡" },
            { icon: "H", label: "HappyHorse", desc: "视频生成能力" },
          ].map((f) => (
            <div key={f.label} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 10,
              border: "1px solid var(--border)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          说明
        </h2>
        <div
          style={{
            padding: 24,
            background: "linear-gradient(135deg, rgba(15,23,42,0.02), rgba(59,130,246,0.04))",
            borderRadius: 16,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
            为什么这里不再列出 Claude 型号
          </div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
            目前后端模型注册表和线上网关仅保留已经完成联调、可通过统一接口稳定调用的模型。
            Claude 相关型号暂未接入当前实例，因此这个页面改为占位说明，避免用户在模型页看到和实际接口不一致的能力描述。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          可替代入口
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/models/qwen", label: "通义千问", desc: "通用对话、Agent 与多模态主力模型" },
            { href: "/docs/models/deepseek", label: "DeepSeek", desc: "推理、代码、长上下文场景优先" },
            { href: "/docs/api/chat", label: "统一对话接口", desc: "直接查看当前可用请求格式和参数" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: 16,
                background: "var(--bg-elevated)",
                borderRadius: 10,
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "对话补全 API", desc: "API 调用方式" },
            { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟上手" },
            { href: "/playground", label: "Playground", desc: "在线体验" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
