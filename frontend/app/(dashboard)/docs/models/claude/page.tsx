import Link from "next/link";

const claudeModels = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    desc: "The most powerful general-purpose Claude, suited for complex reasoning, agentic coding, and large-context tasks.",
    context: "1M",
    output: "128K",
    usd: "$5 / $25",
    cny: "≈ ¥34 / ¥170",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    desc: "A balanced blend of speed and intelligence for production workloads, suited for coding, tool calling, and multi-turn conversations.",
    context: "1M",
    output: "64K",
    usd: "$3 / $15",
    cny: "≈ ¥20.4 / ¥102",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    desc: "High-speed, low-cost Claude, suited for low-latency classification, extraction, batch processing, and lightweight chat.",
    context: "200K",
    output: "64K",
    usd: "$1 / $5",
    cny: "≈ ¥6.8 / ¥34",
  },
];

export default function ClaudeModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 10 }}>
          Anthropic Official Channel
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Claude Models
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          NexusFlow has integrated Claude's official Messages API route. Claude models are called via <code>/v1/messages</code>, requiring backend configuration of <code>ANTHROPIC_API_KEY</code>.
          The USD column shows Anthropic's official public pricing, and the CNY column shows the current project's billing rate based on <code>1 USD ≈ ¥6.8</code> conversion.
        </p>
      </div>

      <section style={{ marginBottom: 36 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "12px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Scenario</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Context</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Max Output</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Official USD / MTok</th>
                <th style={{ padding: "12px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>NexusFlow Billing</th>
              </tr>
            </thead>
            <tbody>
              {claudeModels.map((model, i) => (
                <tr key={model.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{model.name}</div>
                    <code style={{ fontSize: 12 }}>{model.id}</code>
                  </td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {model.desc}
                  </td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.context}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.output}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model.usd}</td>
                  <td style={{ padding: "14px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)", fontWeight: 700 }}>{model.cny}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Billing Details</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
          Basic input and output token prices follows Anthropic's official model pricing table. Prompt cache write is billed at 1.25x input price; cache hit at 0.1x input price. Batch, data residency, server-side tools, and other additional pricing is not yet shown separately in the public billing UI.
        </p>
      </section>

      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/claude", label: "Claude API", desc: "View /v1/messages invocation method" },
            { href: "/models", label: "Model Catalog", desc: "View all available models" },
            { href: "/pricing", label: "Full Pricing", desc: "Browse pricing by provider" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding: 16,
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}