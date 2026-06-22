"use client";

const rateLimits = [
  { tier: "Free", rpm: 20, tpm: "40K", concurrent: 2, desc: "For personal learning and testing" },
  { tier: "Developer", rpm: 60, tpm: "150K", concurrent: 5, desc: "For individual developers and small projects" },
  { tier: "Team", rpm: 200, tpm: "500K", concurrent: 20, desc: "For team collaboration and mid-sized apps" },
  { tier: "Enterprise", rpm: 1000, tpm: "2M", concurrent: 100, desc: "For large-scale production environments" },
  { tier: "Custom", rpm: "Custom", tpm: "Custom", concurrent: "Custom", desc: "Custom limits based on your needs" },
];

const modelLimits = [
  { model: "qwen3-max", maxInput: "252K", maxOutput: "64K", contextWindow: "256K" },
  { model: "qwen3.6-max-preview", maxInput: "256K", maxOutput: "64K", contextWindow: "256K" },
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
        nexusflow controls peak traffic through RPM, TPM, approval flows, async tasks, and a monitoring system. High concurrency is not a single number — it is a combination of rate limits, queues, polling cadence, and model latency.
      </p>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { title: "RPM", desc: "Controls request frequency to prevent instantaneous spikes from overwhelming the upstream." },
            { title: "TPM", desc: "Limits tokens per minute to prevent long-context traffic from crowding out resources." },
            { title: "Concurrency", desc: "Route long tasks through an async queue rather than holding synchronous connections open." },
            { title: "Monitoring", desc: "Watch for peak-period degradation via TTFT, success rate, and per-model latency." },
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
          The currently reliable response headers concern remaining quota. More granular headers will depend on what future platform versions expose.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: 260 }}>Response Header</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { header: "X-RateLimit-Remaining", desc: "Remaining request quota visible to the current request path" },
                { header: "Retry-After", desc: "Recommended wait time in seconds when rate-limited; clients should use exponential backoff" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>High-Concurrency Recommendations</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { title: "Separate sync and async", desc: "Route chat through `/v1/chat/completions` and image / video through `/v1/tasks` to keep long tasks off the synchronous path." },
            { title: "Back off when polling", desc: "Do not poll task status too frequently; use a fixed 3-5 second interval or exponential backoff to reduce amplification." },
            { title: "Watch degradation on the monitoring page", desc: "Track request volume, TTFT, success rate, and per-model latency to tell whether you are approaching the capacity ceiling." },
            { title: "Degrade gracefully on your side", desc: "During peaks, switch to faster models first, or reduce max_tokens and long-context usage." },
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
