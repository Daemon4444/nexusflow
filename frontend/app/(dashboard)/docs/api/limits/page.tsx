"use client";

const rateLimits = [
  { tier: "Free", rpm: 20, tpm: "40K", concurrent: 2, desc: "Suitable for personal study and testing" },
  { tier: "Developer", rpm: 60, tpm: "150K", concurrent: 5, desc: "Suitable for individual developers and small projects" },
  { tier: "Team", rpm: 200, tpm: "500K", concurrent: 20, desc: "Suitable for team collaboration and medium-sized apps" },
  { tier: "Enterprise", rpm: 1000, tpm: "2M", concurrent: 100, desc: "Suitable for large-scale production environments" },
  { tier: "Custom", rpm: "Custom", tpm: "Custom", concurrent: "Custom", desc: "Limits tailored to your needs" },
];

const modelLimits = [
  { model: "qwen3-max", maxInput: "258K", maxOutput: "64K", contextWindow: "262K" },
  { model: "qwen3.6-max-preview", maxInput: "262K", maxOutput: "64K", contextWindow: "262K" },
  { model: "qwen3.6-plus", maxInput: "1M", maxOutput: "64K", contextWindow: "1M" },
  { model: "qwen3.6-flash", maxInput: "1M", maxOutput: "64K", contextWindow: "1M" },
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
        Rate Limits
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 40, lineHeight: 1.7 }}>
        nexusflow controls peak traffic with RPM, TPM, approval workflows, async tasks, and a monitoring system. High-concurrency capacity is not a single number—it's a combination of rate limits, queueing, polling cadence, and model latency.
      </p>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { title: "RPM", desc: "Controls request frequency to prevent instantaneous spikes from overwhelming upstream services." },
            { title: "TPM", desc: "Limits per-minute tokens, preventing long-context traffic from monopolizing resources." },
            { title: "Concurrency", desc: "Long-running tasks should go through async queues rather than holding synchronous connections open." },
            { title: "Monitoring", desc: "Use TTFT, success rate, and per-model latency to observe degradation during peak periods." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Plan Rate Limits</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Plan</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>RPM</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>TPM</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Concurrency</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Description</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Model Token Limits</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Context Window</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Max Input</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>Max Output</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Rate Limit Response Headers</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          The currently stable headers expose remaining-quota information. Finer-grained headers depend on future platform releases.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: 260 }}>Header</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { header: "X-RateLimit-Remaining", desc: "Remaining request quota visible to the current request path" },
                { header: "Retry-After", desc: "Recommended wait time in seconds when rate-limited; clients should combine this with exponential backoff" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>High-concurrency Recommendations</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { title: "Separate sync and async paths", desc: "Send chat to `/v1/chat/completions` and image/video to `/v1/tasks`, removing long-running work from the synchronous path." },
            { title: "Back off when polling", desc: "Do not poll task status at high frequency; use a fixed 3-5 seconds or exponential backoff to avoid amplification effects." },
            { title: "Watch the monitoring page for degradation", desc: "Monitor request volume, TTFT, success rate, and per-model latency to identify when capacity limits are being approached." },
            { title: "Apply business-level fallbacks", desc: "During peak periods, switch to faster models or reduce max_tokens and long-context usage." },
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
