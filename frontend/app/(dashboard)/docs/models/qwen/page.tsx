"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const qwenModels = [
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    desc: "Qwen3.6 系列最强预览模型，适合复杂推理、多步骤代码生成和工具型任务。",
    ctx: "262,144",
    maxOutput: "65,536",
    inputPrice: "¥9",
    outputPrice: "¥54",
    tags: ["旗舰", "思考模式"],
    features: ["函数调用", "复杂推理", "代码生成"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    desc: "均衡旗舰模型，支持百万级上下文窗口、函数调用与内置工具，适合大多数生产场景。",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "¥2",
    outputPrice: "¥12",
    tags: ["推荐", "均衡"],
    features: ["图像理解", "函数调用", "代码生成", "百万上下文"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    desc: "均衡性能模型，适合大多数生产场景。中文能力优秀，响应速度快。",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "¥0.8",
    outputPrice: "¥4.8",
    tags: ["推荐", "均衡"],
    features: ["图像理解", "函数调用", "代码生成"],
    isNew: true,
    isFeatured: true,
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    desc: "高速响应模型，适合对延迟敏感的场景。性价比高。",
    ctx: "1,000,000",
    maxOutput: "65,536",
    inputPrice: "¥0.2",
    outputPrice: "¥2",
    tags: ["快速", "经济"],
    features: ["函数调用", "低成本"],
    isNew: false,
    isFeatured: false,
  },
];

export default function QwenModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              通义千问系列
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              by 阿里云
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          通义千问是阿里云自研的大语言模型。当前这里优先展示 Qwen3.6 与 Qwen3.5 系列，
          它们覆盖长文本、函数调用、代码生成和复杂推理等常见生产场景。文本类模型可通过 OpenAI Chat、Anthropic Messages 和 Gemini-compatible 三类公共协议接入。
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          接入协议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "OpenAI Chat", endpoint: "/v1/chat/completions" },
            { href: "/docs/api/anthropic", label: "Anthropic Messages", endpoint: "/v1/messages" },
            { href: "/docs/api/gemini", label: "Gemini-compatible", endpoint: "/v1beta/models/{model}:generateContent" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{item.label}</div>
              <code style={{ fontSize: 11, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{item.endpoint}</code>
            </Link>
          ))}
        </div>
      </section>

      {/* Key features */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          核心优势
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "🇨🇳", label: "中文优化", desc: "母语级理解" },
            { icon: "📚", label: "长文本", desc: "百万上下文" },
            { icon: "⚡", label: "高性价比", desc: "价格实惠" },
            { icon: "🔗", label: "生态整合", desc: "阿里云无缝" },
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
          {qwenModels.map((model) => (
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
                    <span key={tag} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: tag === "推荐" ? "var(--accent-bg)" : "var(--bg-elevated)", color: tag === "推荐" ? "var(--accent)" : "var(--text-secondary)", fontWeight: 500 }}>
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
          <DocsCodeBlock code={`from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

# 使用通义千问处理长文本
response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[
        {"role": "system", "content": "你是一个专业的文档分析助手。"},
        {"role": "user", "content": "请总结以下长文档的主要内容...（此处可输入超长文本）"}
    ],
    max_tokens=4096,
)

print(response.choices[0].message.content)`} />
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
            { href: "/docs/models/deepseek", label: "DeepSeek 系列", desc: "对比推理模型" },
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
