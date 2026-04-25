"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const codeExamples: Record<string, string> = {
  openai_curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3-max",
    "models": ["deepseek-v3.2", "glm-4.7"],
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  anthropic_curl: `curl -X POST ${API_BASE}/v1/messages \\
  -H "x-api-key: sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "qwen3-max",
    "models": ["deepseek-v3.2", "glm-4.7"],
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3-max",
    extra_body={"models": ["deepseek-v3.2", "glm-4.7"]},
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
};

export default function ModelFallbackPage() {
  const [lang, setLang] = useState("openai_curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>功能</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          模型降级设计
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          规划中的 request-level fallback 设计，用于在首选模型不可用时切换到备选模型
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>models</code> 参数允许你指定备选模型列表。
          当主模型（<code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>model</code> 字段）的所有供应商都无法响应时，
          系统会按顺序尝试备选模型，直到某个模型成功返回。
        </p>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          这部分目前作为 public API 设计文档保留，便于后续将 OpenAI / Anthropic 请求级降级收敛成统一规范；当前线上更稳定的容错仍以 provider 级故障切换为主。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>工作原理</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          在请求体中使用 <code style={{ fontFamily: "var(--font-mono)" }}>model</code> 指定主模型，同时通过 <code style={{ fontFamily: "var(--font-mono)" }}>models</code> 数组按优先级排列备选模型。
          下方示例展示的是规划中的 public contract，用于定义未来的模型级降级行为。
        </p>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {([
            { key: "openai_curl", label: "OpenAI cURL" },
            { key: "anthropic_curl", label: "Anthropic cURL" },
            { key: "python", label: "Python" },
          ]).map((l) => (
            <button key={l.key} onClick={() => setLang(l.key)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: lang === l.key ? "#333" : "transparent",
              color: lang === l.key ? "#fff" : "var(--text-tertiary)",
            }}>
              {l.label}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>{codeExamples[lang]}</pre>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>降级行为</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>场景</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>行为</th>
              </tr>
            </thead>
            <tbody>
              {[
                { scene: "主模型可用", action: "正常使用主模型（model 字段）" },
                { scene: "主模型所有供应商失败", action: "按顺序尝试 models 中的备选模型" },
                { scene: "所有模型都失败", action: "返回最后一个错误" },
              ].map((row, idx) => (
                <tr key={row.scene} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.scene}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>定价</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          请求按实际使用的模型计费。你可以在 <Link href="/activity" style={{ color: "var(--accent)" }}>调用日志</Link> 中查看每次请求实际使用的模型和对应费用。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>使用建议</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { title: "按能力排序", desc: "将能力最强的模型作为主模型，能力稍弱但稳定性更高的模型作为备选。" },
            { title: "合理设置数量", desc: "1-2 个备选模型通常足够。过多的备选会增加总体延迟。" },
            { title: "适用场景", desc: "模型降级适合对可用性要求极高的生产环境。对于开发和测试，使用单个模型即可。" },
            { title: "结合供应商路由", desc: "供应商路由处理同一模型的端点切换，模型降级处理跨模型的兜底。两者互为补充。" },
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
            { href: "/docs/provider-routing", label: "供应商路由", desc: "同一模型的多供应商自动切换" },
            { href: "/docs/models", label: "模型列表", desc: "浏览所有可用模型" },
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
