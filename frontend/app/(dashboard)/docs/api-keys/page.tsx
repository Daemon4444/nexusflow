"use client";

import Link from "next/link";

export default function ApiKeysDocPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>认证</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          API 密钥
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          创建和管理你的 API 密钥
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>创建密钥</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          登录后，前往 <Link href="/keys" style={{ color: "var(--accent)" }}>API 密钥</Link> 页面，点击「创建密钥」生成一个新的 API Key。
        </p>
        <div style={{ padding: 16, borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>注意</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            密钥创建后请立即复制保存。出于安全考虑，密钥值在创建后不会再次完整显示。如果遗失，需删除后重新创建。
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>密钥格式</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          nexusflow 的 API Key 统一使用 <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>sk-air-</code> 前缀，后接随机字符串。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 16 }}>
          <code style={{ fontSize: 13, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>sk-air-a1b2c3d4e5f6g7h8i9j0...</code>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>鉴权方式</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          所有协议都可以通过各自原生的请求头传递 API Key（SDK 会自动处理）。此外，Anthropic 协议也支持通过通用的 <code style={{ fontFamily: "var(--font-mono)" }}>Authorization: Bearer</code> 请求头传递。
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>协议</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>原生请求头</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>通用请求头</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI", native: "Authorization: Bearer KEY", generic: "-" },
                { proto: "Anthropic", native: "x-api-key: KEY", generic: "Authorization: Bearer KEY" },
              ].map((row, idx) => (
                <tr key={row.proto} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.proto}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.native}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.generic}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12, lineHeight: 1.7 }}>
          使用官方 SDK 时无需关心请求头细节，SDK 会自动处理。通用请求头主要方便你使用 cURL 或自定义 HTTP 客户端时统一鉴权方式。
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>最佳实践</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { title: "按项目隔离", desc: "为不同项目创建独立的 Key，便于管理和追踪用量。" },
            { title: "定期轮换", desc: "定期删除旧 Key 并创建新 Key，降低泄露风险。" },
            { title: "环境变量存储", desc: "不要在代码中硬编码 Key，使用环境变量或密钥管理服务。" },
            { title: "泄露处理", desc: "如果 Key 泄露，立即在密钥管理页面删除该 Key 并创建新的。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>相关文档</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "快速开始", desc: "三步上手调用大模型" },
            { href: "/docs/multi-protocol", label: "多协议支持", desc: "了解各协议的鉴权方式" },
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
