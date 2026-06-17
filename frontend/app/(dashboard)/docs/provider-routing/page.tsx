"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

export default function ProviderRoutingPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>功能</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          供应商路由
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          同一模型的多供应商智能路由与自动容错
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow 为同一模型配置了多个供应商端点。系统会根据各端点的实时表现智能选择最优端点，并在供应商不可用时自动切换，整个过程对调用方完全透明。
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>智能路由</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 20 }}>
          当你发起 API 请求时，系统会根据模型 ID 和请求协议筛选出所有匹配的供应商端点，并综合端点的稳定性、延迟等因素选择最优端点。当某个端点出现异常时，系统会自动降低其优先级；恢复后自动回到正常位置，无需人工干预。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Client      │────▶│  nexusflow      │────▶│  供应商 A (主)    │
│  POST /v1/   │     │  智能路由        │     │  通义千问         │
│  chat/compl  │     │                 │     └──────────────────┘
└──────────────┘     │  健康检测        │     ┌──────────────────┐
                     │  延迟监控        │────▶│  供应商 B (备)    │
                     │  自动切换        │     │  (可扩展)        │
                     └─────────────────┘     └──────────────────┘`} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "健康检测", desc: "定时检测上游端点状态，连续失败自动标记为 degraded / down。" },
            { title: "加权选择", desc: "综合端点优先级和权重进行负载均衡，健康端点优先使用。" },
            { title: "透明恢复", desc: "故障端点恢复后自动回到正常优先级，无需人工干预。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>自动容错</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 20 }}>
          当选中的端点返回服务端错误（5xx）或限流（429）时，系统会自动重试下一个可用端点，直到请求成功或所有端点都已尝试。400 类客户端错误不会触发重试。
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>端点状态</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>条件</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>行为</th>
              </tr>
            </thead>
            <tbody>
              {[
                { status: "healthy", cond: "连续成功", action: "正常使用，最高优先级" },
                { status: "degraded", cond: "连续失败 >= 3 次", action: "降低优先级，仍可被选择" },
                { status: "down", cond: "连续失败 >= 5 次", action: "跳过该端点，不再尝试" },
              ].map((row, idx) => (
                <tr key={row.status} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ color: row.status === "healthy" ? "var(--success)" : row.status === "degraded" ? "var(--warning)" : "#ef4444" }}>{row.status}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.cond}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>注意事项</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>流式请求</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              如果端点在开始返回数据之前就失败了，系统可以无感地切换到下一个端点。但一旦数据已经开始发送给客户端，就无法再切换端点，错误会直接透传给客户端。
              <br /><br />
              建议在客户端实现流式请求的错误处理逻辑，以应对流中断的情况。
            </div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>协议不一致</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              容错能力取决于该模型在当前请求协议下有多少个可用端点，而非供应商总数。例如一个模型有两个供应商，但只有一个支持 Anthropic 协议，那么通过 Anthropic 协议请求时将无法容错。
              <br /><br />
              如果需要容错保障，建议使用模型支持最广泛的协议（通常是 OpenAI 协议），或结合<Link href="/docs/model-fallback" style={{ color: "var(--accent)" }}>模型降级</Link>配置备选模型。
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>相关文档</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/model-fallback", label: "模型降级", desc: "当所有供应商都失败时，自动切换到备选模型" },
            { href: "/docs/multi-protocol", label: "多协议支持", desc: "了解各协议的适用场景" },
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
