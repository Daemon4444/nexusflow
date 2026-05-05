"use client";

import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

export default function PrinciplesPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>概览</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          为什么选择 nexusflow
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 600 }}>
          一个 URL 调用所有大模型
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 24 }}>
          nexusflow 是一个 AI 模型聚合路由平台，提供统一的 API 入口调用国内外主流大模型。
          我们相信未来是多模型、多供应商的，开发者不应该被绑定在单一平台上。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>核心优势</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              title: "多协议原生支持",
              code: "OpenAI | Anthropic | Gemini",
              desc: "原生支持 OpenAI、Anthropic Messages 和 Gemini-compatible 三种协议。使用官方 SDK 或兼容 HTTP 格式，只需修改 Base URL 即可接入。",
            },
            {
              title: "智能路由",
              code: "route(model) → provider",
              desc: "根据模型名称和请求协议自动路由至对应供应商端点。公共 API 与上游 DashScope / 百炼原生协议解耦，业务侧只需要关心 NexusFlow 支持的 public protocol。",
            },
            {
              title: "统一计费",
              code: "billing.unified()",
              desc: "跨供应商统一 Token 消耗统计与账单。无论使用多少模型，所有费用统一从 nexusflow 余额扣除，告别多平台分别充值的混乱。",
            },
            {
              title: "容错降级",
              code: "fallback: model[] → provider[]",
              desc: "同一模型支持多供应商端点自动切换；单次请求可指定多个候选模型，逐级降级，保障服务持续可用。",
            },
            {
              title: "模型丰富",
              code: "models.list() → 45+",
              desc: "接入通义千问、DeepSeek、GLM、Kimi、MiniMax、PixVerse、HappyHorse 等国内头部模型。涵盖文本、推理、视觉、编程、图像、视频、向量等类别。",
            },
            {
              title: "开箱即用",
              code: "baseURL: \"nexusflow.hk/v1\"",
              desc: "注册即用，分钟级接入。兼容现有 OpenAI / Anthropic / Google GenAI SDK，迁移成本低。",
            },
          ].map((item) => (
            <div key={item.title} style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <code style={{ display: "block", fontSize: 11, color: "var(--accent)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>{item.code}</code>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          与直接使用供应商 API 的对比
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "30%" }}>能力</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>直接使用供应商</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>使用 nexusflow</th>
              </tr>
            </thead>
            <tbody>
              {[
                { cap: "切换模型/供应商", direct: "需要修改代码和 API Key", nf: "只需修改 model 参数" },
                { cap: "供应商故障", direct: "服务中断", nf: "自动降级到备用供应商" },
                { cap: "计费管理", direct: "每个供应商单独管理", nf: "统一余额，一处管理" },
                { cap: "用量追踪", direct: "各平台分散查看", nf: "集中式日志和报表" },
                { cap: "多协议支持", direct: "每个协议独立配置", nf: "一个 Key 调用所有协议" },
              ].map((row, idx) => (
                <tr key={row.cap} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.cap}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>{row.direct}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--success)" }}>{row.nf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>适用场景</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "个人开发者", desc: "一个 API Key 即可调用市面上所有主流模型，无需逐一注册各家平台。" },
            { title: "创业团队", desc: "统一管理 API 用量和成本，快速测试不同模型找到最佳方案。" },
            { title: "企业用户", desc: "高可用保障、自动降级、集中式审计日志，满足生产级需求。" },
          ].map((s) => (
            <div key={s.title} style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>相关文档</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "快速开始", desc: "三步上手调用大模型" },
            { href: "/docs/multi-protocol", label: "多协议支持", desc: "使用 OpenAI、Anthropic、Gemini 协议" },
            { href: "/docs/provider-routing", label: "供应商路由", desc: "智能路由与自动降级" },
            { href: "/docs/model-fallback", label: "模型降级", desc: "配置备选模型提高可用性" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
