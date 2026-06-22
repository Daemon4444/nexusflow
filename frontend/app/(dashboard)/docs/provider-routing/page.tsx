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
          Smart multi-provider routing and automatic failover for the same model
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          nexusflow configures multiple provider endpoints for the same model. The system intelligently selects the best endpoint based on each one's real-time performance and automatically switches when a provider is unavailable — entirely transparent to the caller.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Smart Routing</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 20 }}>
          When you make an API request, the system filters all matching provider endpoints by model ID and request protocol, then selects the best one based on factors like stability and latency. When an endpoint misbehaves, its priority is lowered automatically; once it recovers, it returns to normal with no manual intervention.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Client      │────▶│  nexusflow      │────▶│  Provider A (main)│
│  POST /v1/   │     │  Smart Routing  │     │  Qwen            │
│  chat/compl  │     │                 │     └──────────────────┘
└──────────────┘     │  Health Checks  │     ┌──────────────────┐
                     │  Latency Watch  │────▶│  Provider B (bak)│
                     │  Auto Failover  │     │  (extensible)    │
                     └─────────────────┘     └──────────────────┘`} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "Health Checks", desc: "Periodically check upstream endpoint status; consecutive failures are marked degraded / down automatically." },
            { title: "Weighted Selection", desc: "Load-balances by combining endpoint priority and weight, preferring healthy endpoints." },
            { title: "Transparent Recovery", desc: "Failed endpoints return to normal priority once recovered, with no manual intervention." },
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
          When the selected endpoint returns a server error (5xx) or rate limit (429), the system automatically retries the next available endpoint until the request succeeds or all endpoints have been tried. 400-class client errors do not trigger retries.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Endpoint Status</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Condition</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Behavior</th>
              </tr>
            </thead>
            <tbody>
              {[
                { status: "healthy", cond: "Consecutive successes", action: "Used normally, highest priority" },
                { status: "degraded", cond: "Consecutive failures >= 3", action: "Lower priority, still selectable" },
                { status: "down", cond: "Consecutive failures >= 5", action: "Skip the endpoint, no longer tried" },
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
              If an endpoint fails before it starts returning data, the system can seamlessly switch to the next one. But once data has begun streaming to the client, the endpoint can no longer be switched, and the error is passed directly to the client.
              <br /><br />
              We recommend implementing error handling for streaming requests on the client to handle stream interruptions.
            </div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Protocol Mismatch</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              Failover capability depends on how many endpoints are available for the model under the current request protocol, not the total number of providers. For example, if a model has two providers but only one supports the Anthropic protocol, requests via the Anthropic protocol cannot fail over.
              <br /><br />
              If you need failover guarantees, use the protocol the model supports most widely (usually the OpenAI protocol), or configure fallback models with <Link href="/docs/model-fallback" style={{ color: "var(--accent)" }}>Model Fallback</Link>.
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/model-fallback", label: "Model Fallback", desc: "Automatically switch to a backup model when all providers fail" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Learn which protocol fits each scenario" },
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
