"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

export default function ProviderRoutingPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Feature</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Provider Routing
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          Smart routing and automatic failover across multiple providers for the same model.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow configures multiple provider endpoints for the same model. The system picks the best one based on real-time performance and switches automatically when a provider becomes unavailable—all transparently to your code.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Smart Routing</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 20 }}>
          When you make an API request, the system filters all matching provider endpoints by model ID and request protocol, then picks the best one weighing stability, latency, and other factors. When an endpoint misbehaves, its priority is automatically lowered; when it recovers, it returns to its normal slot—no manual intervention required.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Client      │────▶│  nexusflow      │────▶│  Provider A (1)  │
│  POST /v1/   │     │  smart routing  │     │  DashScope       │
│  chat/compl  │     │                 │     └──────────────────┘
└──────────────┘     │  health checks  │     ┌──────────────────┐
                     │  latency stats  │────▶│  Provider B (2)  │
                     │  auto failover  │     │  (extensible)    │
                     └─────────────────┘     └──────────────────┘`} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "Health Checks", desc: "Periodic upstream probes; consecutive failures auto-mark an endpoint as degraded / down." },
            { title: "Weighted Selection", desc: "Load balancing combines endpoint priority and weight—healthy endpoints are preferred." },
            { title: "Transparent Recovery", desc: "Recovered endpoints automatically return to normal priority—no manual intervention required." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Automatic Failover</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 20 }}>
          When the chosen endpoint returns a server error (5xx) or rate limit (429), the system automatically retries the next available endpoint until the request succeeds or all endpoints have been tried. 4xx client errors do not trigger retries.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Endpoint State</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Condition</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Behavior</th>
              </tr>
            </thead>
            <tbody>
              {[
                { status: "healthy", cond: "Consecutive successes", action: "Used normally—highest priority" },
                { status: "degraded", cond: "≥ 3 consecutive failures", action: "Priority lowered, but still selectable" },
                { status: "down", cond: "≥ 5 consecutive failures", action: "Skipped—no longer tried" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Notes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Streaming Requests</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              If an endpoint fails before any data has been sent, the system can switch transparently to the next endpoint. But once data has started streaming back to the client, the endpoint can no longer be switched and the error is surfaced directly.
              <br /><br />
              We recommend implementing client-side error handling for streaming requests so you can react gracefully to mid-stream interruptions.
            </div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Protocol Coverage</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              Failover capability depends on how many endpoints support the request protocol for the current model—not on the total number of providers. For example, a model with two providers but only one that supports the Anthropic protocol cannot fail over when called via Anthropic.
              <br /><br />
              For maximum failover coverage, prefer the most widely supported protocol (usually OpenAI), or pair routing with <Link href="/docs/model-fallback" style={{ color: "var(--accent)" }}>model fallback</Link> backups.
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/model-fallback", label: "Model Fallback", desc: "Switch to a backup model when every provider fails" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Pick the right protocol for your use case" },
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
