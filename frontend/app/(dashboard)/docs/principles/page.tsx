"use client";

import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

export default function PrinciplesPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Overview</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Why nexusflow
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 600 }}>
          One URL to call every model
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 24 }}>
          nexusflow is an AI model aggregation and routing platform that provides a unified API endpoint for calling major models worldwide. We believe the future is multi-model and multi-provider, and developers should not be locked into a single platform.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Core Advantages</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              title: "Native Multi-Protocol Support",
              code: "OpenAI | Anthropic | Responses",
              desc: "Native support for three protocols: OpenAI, Anthropic Messages, and Responses API. Use the official SDKs or compatible HTTP format — just change the Base URL to connect.",
            },
            {
              title: "Smart Routing",
              code: "route(model) → provider",
              desc: "Automatically routes to the matching provider endpoint based on the model name and request protocol. The public API is decoupled from upstream native protocols, so your application only needs to care about the public protocols NexusFlow supports.",
            },
            {
              title: "Unified Billing",
              code: "billing.unified()",
              desc: "Unified token usage tracking and billing across providers. No matter how many models you use, all charges are deducted from a single nexusflow balance — no more juggling top-ups across platforms.",
            },
            {
              title: "Failover & Fallback",
              code: "fallback: model[] → provider[]",
              desc: "Automatic switching across multiple provider endpoints for the same model; a single request can specify several candidate models that fall back in order, keeping the service continuously available.",
            },
            {
              title: "Rich Model Selection",
              code: "models.list() → 45+",
              desc: "Integrates leading models including Qwen, DeepSeek, GLM, Kimi, MiniMax, PixVerse, and HappyHorse. Covers text, reasoning, vision, coding, image, video, and embedding categories.",
            },
            {
              title: "Ready Out of the Box",
              code: "baseURL: \"nexusflow.hk/v1\"",
              desc: "Use it as soon as you sign up, with integration in minutes. Compatible with existing OpenAI / Anthropic / Google GenAI SDKs, so migration cost is low.",
            },
          ].map((item) => (
            <div key={item.title} style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <code style={{ display: "block", fontSize: 11, color: "var(--accent)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>{item.code}</code>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Compared with Calling Provider APIs Directly
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "30%" }}>Capability</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>Using Providers Directly</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>Using nexusflow</th>
              </tr>
            </thead>
            <tbody>
              {[
                { cap: "Switching models/providers", direct: "Requires code and API key changes", nf: "Just change the model parameter" },
                { cap: "Provider outage", direct: "Service interruption", nf: "Automatic fallback to a backup provider" },
                { cap: "Billing management", direct: "Managed separately per provider", nf: "Unified balance, managed in one place" },
                { cap: "Usage tracking", direct: "Scattered across platforms", nf: "Centralized logs and reports" },
                { cap: "Multi-protocol support", direct: "Configured separately per protocol", nf: "One key calls all protocols" },
              ].map((row, idx) => (
                <tr key={row.cap} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.cap}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>{row.direct}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--success)" }}>{row.nf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Use Cases</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "Individual Developers", desc: "A single API key calls every major model on the market — no need to register with each platform individually." },
            { title: "Startup Teams", desc: "Manage API usage and cost in one place, and quickly test different models to find the best fit." },
            { title: "Enterprise Users", desc: "High-availability guarantees, automatic fallback, and centralized audit logs to meet production-grade needs." },
          ].map((s) => (
            <div key={s.title} style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "Quick Start", desc: "Call models in three steps" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Use the OpenAI, Anthropic, and Responses protocols" },
            { href: "/docs/provider-routing", label: "Provider Routing", desc: "Smart routing and automatic fallback" },
            { href: "/docs/model-fallback", label: "Model Fallback", desc: "Configure backup models to improve availability" },
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
