"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const codeExamples: Record<string, string> = {
  openai_curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3-max",
    "models": ["deepseek-v3.2", "glm-4.7"],
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  anthropic_curl: `curl -X POST ${API_BASE}/v1/messages \\
  -H "x-api-key: sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "qwen3-max",
    "models": ["deepseek-v3.2", "glm-4.7"],
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3-max",
    extra_body={"models": ["deepseek-v3.2", "glm-4.7"]},
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
};

export default function ModelFallbackPage() {
  const [lang, setLang] = useState("openai_curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Feature</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          Model Fallback Design
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          A planned request-level fallback design that switches to a backup model when the primary model is unavailable.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          The <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>models</code> parameter lets you specify a list of backup models.
          When every provider for the primary model (the <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>model</code> field) fails to respond,
          the system tries the backup models in order until one succeeds.
        </p>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          For now this is kept here as a public-API design doc so we can later converge OpenAI / Anthropic request-level fallback into a unified spec; the most reliable failover today is still provider-level switching.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>How It Works</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Use <code style={{ fontFamily: "var(--font-mono)" }}>model</code> in the request body for the primary model and order the backups in the <code style={{ fontFamily: "var(--font-mono)" }}>models</code> array by priority.
          The example below illustrates the planned public contract that defines future model-level fallback behavior.
        </p>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {([
            { key: "openai_curl", label: "OpenAI cURL" },
            { key: "anthropic_curl", label: "Anthropic cURL" },
            { key: "python", label: "Python" },
          ]).map((l) => (
            <button key={l.key} onClick={() => setLang(l.key)} style={{
              padding: "5px 14px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 500,
              cursor: "pointer", background: lang === l.key ? "#333" : "transparent",
              color: lang === l.key ? "#fff" : "var(--text-tertiary)",
            }}>
              {l.label}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <DocsCodeBlock code={codeExamples[lang]} />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>Fallback Behavior</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Scenario</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Behavior</th>
              </tr>
            </thead>
            <tbody>
              {[
                { scene: "Primary model available", action: "Use the primary model (the model field) normally" },
                { scene: "All providers for the primary model fail", action: "Try the backup models from the models array in order" },
                { scene: "All models fail", action: "Return the last error" },
              ].map((row, idx) => (
                <tr key={row.scene} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.scene}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Pricing</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          Each request is billed based on the model that actually served it. You can review which model was used and its cost in the <Link href="/activity" style={{ color: "var(--accent)" }}>call logs</Link>.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Usage Tips</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { title: "Order by Capability", desc: "Use the most capable model as primary, with slightly weaker but more stable models as backups." },
            { title: "Keep the List Short", desc: "1–2 backups is usually enough—too many adds latency overall." },
            { title: "When to Use", desc: "Model fallback fits production environments that demand high availability. For development and testing, a single model is fine." },
            { title: "Pair with Provider Routing", desc: "Provider routing handles endpoint switching for a single model; model fallback handles cross-model safety nets. They complement each other." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/provider-routing", label: "Provider Routing", desc: "Automatic switching across providers for a single model" },
            { href: "/docs/models", label: "Model Catalog", desc: "Browse all available models" },
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
