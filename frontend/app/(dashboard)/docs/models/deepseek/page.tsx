"use client";

import Link from "next/link";

const deepseekModels = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    desc: "百炼接入的 DeepSeek V4 高速版本，低延迟高吞吐，适合在线问答、客服和高并发网关场景。",
    ctx: "131,072",
    maxOutput: "16,384",
    inputPrice: "¥1",
    outputPrice: "¥4",
    tags: ["V4", "极速", "高并发"],
    features: ["低延迟", "高吞吐", "在线对话"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    desc: "推理增强模型，通过链式思考进行复杂问题分析。在数学、编程、逻辑推理等任务上表现出色。",
    ctx: "64,000",
    maxOutput: "8,000",
    inputPrice: "¥4",
    outputPrice: "¥16",
    tags: ["推理", "思维链"],
    features: ["链式思考", "代码生成", "数学推理"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    desc: "最新一代通用模型，MoE 架构，在代码、数学、通用能力上全面提升。性价比极高。",
    ctx: "64,000",
    maxOutput: "8,000",
    inputPrice: "¥2",
    outputPrice: "¥8",
    tags: ["推荐", "高性价比"],
    features: ["代码生成", "函数调用", "多语言"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "deepseek-coder-v2",
    name: "DeepSeek Coder V2",
    desc: "专业代码模型，支持 300+ 编程语言，代码补全、重构、解释能力强。",
    ctx: "128,000",
    maxOutput: "8,000",
    inputPrice: "¥1",
    outputPrice: "¥2",
    tags: ["编程专用", "超低价"],
    features: ["代码补全", "代码解释", "重构建议"],
    isNew: false,
    isFeatured: false,
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    desc: "对话优化模型，适合聊天机器人、客服等场景。响应自然流畅。",
    ctx: "32,000",
    maxOutput: "4,000",
    inputPrice: "¥1",
    outputPrice: "¥2",
    tags: ["对话", "经济"],
    features: ["对话优化", "多轮对话"],
    isNew: false,
    isFeatured: false,
  },
];

export default function DeepSeekModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              DeepSeek 系列
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              by DeepSeek AI
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          DeepSeek 是国内领先的开源大模型，以极高的性价比著称。
          在代码生成、数学推理方面表现突出，是预算敏感场景的理想选择。
        </p>
      </div>

      {/* Key features */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          核心优势
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "💰", label: "超高性价比", desc: "价格仅为同级 1/10" },
            { icon: "🔓", label: "开源透明", desc: "权重公开可审计" },
            { icon: "💻", label: "代码强者", desc: "编程能力突出" },
            { icon: "🧮", label: "数学推理", desc: "复杂计算能力" },
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

      {/* Models list */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          可用模型
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {deepseekModels.map((model) => (
            <div
              key={model.id}
              style={{
                padding: 24,
                background: "var(--bg)",
                borderRadius: 12,
                border: model.isFeatured ? "2px solid var(--accent)" : "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {model.name}
                    </h3>
                    {model.isNew && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "2px 8px", borderRadius: 4 }}>
                    {model.id}
                  </code>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {model.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: tag === "推荐" || tag === "高性价比" ? "var(--success-bg)" : tag === "推理" ? "var(--warning-bg)" : "var(--bg-elevated)", color: tag === "推荐" || tag === "高性价比" ? "var(--success)" : tag === "推理" ? "var(--warning)" : "var(--text-secondary)", fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
                {model.desc}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>上下文窗口</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.ctx}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>最大输出</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{model.maxOutput}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>输入价格</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{model.inputPrice}/M</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>输出价格</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{model.outputPrice}/M</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {model.features.map((f) => (
                  <span key={f} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Usage example */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          使用示例
        </h2>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
{`from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

# 使用 DeepSeek R1 进行推理
response = client.chat.completions.create(
    model="deepseek-r1",
    messages=[
        {"role": "user", "content": "请一步步分析：如果 A > B，B > C，那么 A 和 C 的关系是什么？"}
    ],
    max_tokens=2048,
)

# R1 模型会展示思维链过程
print(response.choices[0].message.content)`}
          </pre>
        </div>
      </section>

      {/* Related */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "对话补全 API", desc: "API 调用方式" },
            { href: "/docs/models/qwen", label: "通义千问", desc: "对比通用主力模型" },
            { href: "/playground", label: "Playground", desc: "在线体验" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
