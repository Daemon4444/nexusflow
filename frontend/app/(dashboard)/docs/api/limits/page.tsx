"use client";

const rateLimits = [
  { tier: "免费版", rpm: 20, tpm: "40K", concurrent: 2, desc: "适合个人学习和测试" },
  { tier: "开发者", rpm: 60, tpm: "150K", concurrent: 5, desc: "适合个人开发者和小型项目" },
  { tier: "团队版", rpm: 200, tpm: "500K", concurrent: 20, desc: "适合团队协作和中型应用" },
  { tier: "企业版", rpm: 1000, tpm: "2M", concurrent: 100, desc: "适合大规模生产环境" },
  { tier: "定制版", rpm: "定制", tpm: "定制", concurrent: "定制", desc: "根据需求定制限额" },
];

const modelLimits = [
  { model: "qwen3-max", maxInput: "262K", maxOutput: "16K", contextWindow: "262K" },
  { model: "qwen3.6-max-preview", maxInput: "262K", maxOutput: "64K", contextWindow: "262K" },
  { model: "qwen3.6-plus", maxInput: "1M", maxOutput: "64K", contextWindow: "1M" },
  { model: "qwen3.5-plus", maxInput: "1M", maxOutput: "64K", contextWindow: "1M" },
  { model: "deepseek-v4-pro", maxInput: "1M", maxOutput: "16K", contextWindow: "1M" },
  { model: "deepseek-v4-flash", maxInput: "1M", maxOutput: "16K", contextWindow: "1M" },
  { model: "deepseek-r1", maxInput: "64K", maxOutput: "8K", contextWindow: "64K" },
  { model: "deepseek-v3", maxInput: "64K", maxOutput: "8K", contextWindow: "64K" },
];

export default function LimitsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        限流说明
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 40, lineHeight: 1.7 }}>
        nexusflow 通过 RPM、TPM、审批流、异步任务和监控体系控制峰值流量。高并发不是单一数值，而是限流、队列、轮询节奏和模型延迟的组合。
      </p>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { title: "RPM", desc: "控制请求频率，防止瞬时尖峰打穿上游。" },
            { title: "TPM", desc: "限制每分钟 Token 量，避免长上下文流量挤占资源。" },
            { title: "并发", desc: "长任务建议走异步队列，而不是同步连接长时间占位。" },
            { title: "监控", desc: "通过 TTFT、成功率和模型维度延迟观察高峰期退化。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>套餐速率限制</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>套餐</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>RPM</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>TPM</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>并发数</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {rateLimits.map((tier, idx) => (
                <tr key={tier.tier} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{tier.tier}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}><code>{tier.rpm}</code></td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}><code>{tier.tpm}</code></td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}><code>{tier.concurrent}</code></td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{tier.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>模型 Token 限制</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>上下文窗口</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>最大输入</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>最大输出</th>
              </tr>
            </thead>
            <tbody>
              {modelLimits.map((m, idx) => (
                <tr key={m.model} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}><code>{m.model}</code></td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center", fontWeight: 500 }}>{m.contextWindow}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{m.maxInput}</td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>{m.maxOutput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>限流相关响应头</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          当前稳定可依赖的响应头是剩余额度相关信息。更细粒度头部建议以后续平台版本开放情况为准。
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: 260 }}>响应头</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                { header: "X-RateLimit-Remaining", desc: "当前请求链路可见的剩余请求额度" },
                { header: "Retry-After", desc: "触发限流时建议等待秒数；客户端应配合指数退避" },
              ].map((item, idx) => (
                <tr key={item.header} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}><code>{item.header}</code></td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{item.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>高并发场景建议</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { title: "同步与异步分流", desc: "聊天走 `/v1/chat/completions`，图像 / 视频走 `/v1/tasks`，把长任务从同步链路拆出去。" },
            { title: "轮询做退避", desc: "任务状态不要高频轮询；建议固定 3-5 秒或指数退避，减少额外放大效应。" },
            { title: "结合监控页观察退化", desc: "看请求量、TTFT、成功率与模型维度延迟变化，识别是否已逼近容量上限。" },
            { title: "业务侧做降级", desc: "在高峰期优先切换到更快模型，或降低 max_tokens 与长上下文占用。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
