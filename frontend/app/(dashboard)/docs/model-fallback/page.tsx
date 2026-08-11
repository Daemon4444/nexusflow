import Link from "next/link";

export default function ModelFallbackPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>路线图</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          跨模型请求级回退
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 680 }}>
          该能力仍在规划中，当前线上 API 不接收备选模型数组，也不会在不同模型之间自动切换。
        </p>
      </div>

      <section className="nf-inline-warning" role="note" style={{ marginBottom: 28 }}>
        <strong>请勿在生产请求中使用尚未开放的 models 参数</strong>
        <span>当前生产容错只覆盖同一模型下的健康供应商路由；跨模型回退应由调用方自行实现并显式记录实际使用的模型。</span>
      </section>

      <section style={{ padding: 24, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 18, color: "var(--text-primary)" }}>当前可用方案</h2>
        <p style={{ margin: "0 0 18px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.75 }}>
          NexusFlow 会在同一模型的已配置供应商之间执行健康路由。若业务需要跨模型兜底，请在应用侧对明确的错误码进行有限重试，并分别核对模型能力、协议和价格。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn-primary" href="/docs/provider-routing">查看供应商路由</Link>
          <Link className="btn-secondary" href="/docs/api/errors">查看错误码</Link>
        </div>
      </section>
    </div>
  );
}
