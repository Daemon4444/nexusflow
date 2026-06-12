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
          One URL to call every major LLM.
        </p>
      </div>

      <section style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 24 }}>
          nexusflow is an AI model aggregation and routing platform that exposes a single, unified API for the leading global and Chinese LLMs.
          We believe the future is multi-model and multi-provider—developers should not be locked into a single platform.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Core Advantages</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              title: "Native Multi-Protocol Support",
              code: "OpenAI | Anthropic | Gemini",
              desc: "Native support for OpenAI, Anthropic Messages, and Gemini-compatible protocols. Use the official SDKs or compatible HTTP formats—just change the base URL to integrate.",
            },
            {
              title: "Smart Routing",
              code: "route(model) → provider",
              desc: "Requests are routed to the correct provider endpoint based on model name and request protocol. The public API is decoupled from upstream DashScope / Bailian protocols, so your code only needs to know about the public protocols NexusFlow supports.",
            },
            {
              title: "Unified Billing",
              code: "billing.unified()",
              desc: "Token usage and invoicing are unified across providers. Regardless of how many models you use, all costs are deducted from your nexusflow balance—no more juggling top-ups across vendors.",
            },
            {
              title: "Failover & Fallback",
              code: "fallback: model[] → provider[]",
              desc: "Each model can route across multiple provider endpoints automatically; a single request can specify multiple candidate models and fall back step by step to keep service available.",
            },
            {
              title: "Rich Model Catalog",
              code: "models.list() → 45+",
              desc: "Access Qwen, DeepSeek, GLM, Kimi, MiniMax, PixVerse, HappyHorse, and more leading providers. Covers text, reasoning, vision, coding, image, video, and embeddings.",
            },
            {
              title: "Drop-In Integration",
              code: "baseURL: \"nexusflow.hk/v1\"",
              desc: "Sign up and you're ready to go in minutes. Compatible with existing OpenAI / Anthropic / Google GenAI SDKs—migration cost is low.",
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
          Compared to Calling Provider APIs Directly
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "30%" }}>Capability</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>Direct provider use</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)", width: "35%" }}>With nexusflow</th>
              </tr>
            </thead>
            <tbody>
              {[
                { cap: "Switch model / provider", direct: "Requires code and API key changes", nf: "Just change the model parameter" },
                { cap: "Provider outage", direct: "Service stops", nf: "Automatic fallback to a backup provider" },
                { cap: "Billing management", direct: "Managed per provider", nf: "Single unified balance" },
                { cap: "Usage tracking", direct: "Scattered across platforms", nf: "Centralized logs and reports" },
                { cap: "Multi-protocol support", direct: "Configured separately for each protocol", nf: "One key for every protocol" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Who It&apos;s For</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "Individual Developers", desc: "Use a single API key to call every major model on the market—no need to sign up with each provider." },
            { title: "Startup Teams", desc: "Manage API usage and costs in one place, and quickly test different models to find the best fit." },
            { title: "Enterprises", desc: "High-availability guarantees, automatic fallback, and centralized audit logs to meet production-grade requirements." },
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
            { href: "/docs/quickstart", label: "Quick Start", desc: "Three steps to your first model call" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Use OpenAI, Anthropic, and Gemini protocols" },
            { href: "/docs/provider-routing", label: "Provider Routing", desc: "Smart routing and automatic fallback" },
            { href: "/docs/model-fallback", label: "Model Fallback", desc: "Configure backup models for higher availability" },
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
